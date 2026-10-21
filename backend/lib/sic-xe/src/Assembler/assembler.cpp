#include "assembler/assembler.hpp"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <optional>
#include <unordered_map>

#include "assembler/parser.hpp"

namespace sicxe {
namespace {

using i64 = std::int64_t;

std::string upper(std::string_view s) {
  std::string r(s);
  for (char& c : r) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  return r;
}

std::string hex(i64 v, int width = 1) {
  char buf[32];
  std::snprintf(buf, sizeof buf, "0x%0*llX", width, static_cast<unsigned long long>(v));
  return buf;
}

struct Symbol {
  std::string name;
  Value value;
  int line;
  int column;
};

void collectReferences(const ExprPtr& expr, std::vector<SymbolReference>& out, int line) {
  if (!expr) return;
  if (expr->kind == ExprNode::Kind::Symbol) {
    out.push_back({expr->name, line, expr->column, static_cast<int>(expr->name.size())});
    return;
  }
  collectReferences(expr->lhs, out, line);
  collectReferences(expr->rhs, out, line);
}

// One Engine = one assembly run. All state is local, so Assembler is reentrant.
class Engine {
 public:
  Engine(const AssemblerOptions& opt, std::string_view src) : opt_(opt) {
    limit_ = opt.memoryLimit ? static_cast<i64>(opt.memoryLimit)
                             : (opt.mode == ArchMode::Sic ? 0x8000 : 0x100000);
    int lineNo = 0;
    std::size_t pos = 0;
    for (;;) {
      const std::size_t nl = src.find('\n', pos);
      const std::string_view line = src.substr(pos, nl == std::string_view::npos ? nl : nl - pos);
      ++lineNo;
      if (auto st = parseLine(line, lineNo, diags_)) stmts_.push_back(std::move(*st));
      if (nl == std::string_view::npos) break;
      pos = nl + 1;
    }
  }

  AssemblyResult run() {
    pass1();
    pass2();
    if (!sawEnd_) diags_.warning(stmts_.empty() ? 1 : stmts_.back().line, 0, "Missing END directive");
    if (!sawEnd_ || !entrySet_) entry_ = startAddr_;

    AssemblyResult r;
    r.memory = std::move(mem_);
    r.info.diagnostics = diags_.sorted();
    r.info.programName = programName_;
    r.info.startAddress = static_cast<std::size_t>(startAddr_);
    r.info.length = static_cast<std::size_t>(std::max<i64>(0, highWater_ - startAddr_));
    r.info.entryPoint = static_cast<std::size_t>(entry_);
    r.info.relocations = std::move(relocs_);
    for (const auto& [_, s] : symbols_) {
      r.info.symbols[s.name] = s.value.value;
      r.info.symbolDefinitions.push_back(
          {s.name, s.value.value, s.line, s.column, static_cast<int>(s.name.size())});
    }
    for (const Statement& st : stmts_) {
      collectReferences(st.expr, r.info.symbolReferences, st.line);
      for (const DataItem& item : st.items)
        collectReferences(item.expr, r.info.symbolReferences, st.line);
    }
    std::stable_sort(r.info.symbolDefinitions.begin(), r.info.symbolDefinitions.end(),
                     [](const SymbolLocation& a, const SymbolLocation& b) {
                       return a.line == b.line ? a.column < b.column : a.line < b.line;
                     });
    std::stable_sort(r.info.symbolReferences.begin(), r.info.symbolReferences.end(),
                     [](const SymbolReference& a, const SymbolReference& b) {
                       return a.line == b.line ? a.column < b.column : a.line < b.line;
                     });
    r.info.listing = std::move(listing_);
    return r;
  }

 private:
  // ======================= helpers =========================================
  std::optional<Value> eval(const Statement& st, const ExprPtr& e, bool forward) {
    EvalContext ctx;
    ctx.location = st.address;
    ctx.forwardRefsAllowed = forward;
    ctx.lookup = [this](const std::string& n) -> std::optional<Value> {
      auto it = symbols_.find(upper(n));
      if (it == symbols_.end()) return std::nullopt;
      return it->second.value;
    };
    return evaluate(*e, ctx, st.line, diags_);
  }

  void err(const Statement& st, int col, const std::string& m) { diags_.error(st.line, col, m); }

  void defineLabel(const Statement& st, Value v) {
    if (st.label.empty()) return;
    auto [it, inserted] = symbols_.emplace(upper(st.label), Symbol{st.label, v, st.line, st.labelCol});
    if (!inserted)
      err(st, st.labelCol, "Duplicate symbol '" + st.label + "' (first defined on line " +
                               std::to_string(it->second.line) + ")");
  }

  // Evaluates an expression that must be known in pass 1 and lie in [lo, hi].
  std::optional<i64> pass1Value(const Statement& st, const char* what, i64 lo, i64 hi,
                                bool allowRelocatable) {
    auto v = eval(st, st.expr, /*forward=*/false);
    if (!v) return std::nullopt;
    if (v->relocatable() && !allowRelocatable) {
      err(st, st.operandCol, std::string(what) + " must be an absolute expression");
      return std::nullopt;
    }
    if (v->value < lo || v->value > hi) {
      err(st, st.operandCol, std::string(what) + " " + std::to_string(v->value) + " is out of range (" +
                                 std::to_string(lo) + ".." + std::to_string(hi) + ")");
      return std::nullopt;
    }
    return v->value;
  }

  // ======================= pass 1 ==========================================
  void pass1() {
    for (Statement& st : stmts_) {
      st.address = lc_;
      if (ended_) {
        if (!warnedAfterEnd_) { diags_.warning(st.line, 1, "Statements after END are ignored"); warnedAfterEnd_ = true; }
        st.valid = false;
        continue;
      }
      if (st.directive) {
        pass1Directive(st);
      } else if (st.inst) {
        defineLabel(st, Value{lc_, 1});
        pass1Instruction(st);
      } else {
        defineLabel(st, Value{lc_, 1});  // label-only (or unparsable) line
      }
      if (st.directive || st.inst) seenCode_ = true;
      lc_ += st.size;
      highWater_ = std::max(highWater_, lc_);
      if (lc_ > limit_ && !overflowReported_) {
        err(st, 1, "Program exceeds the " + hex(limit_) + "-byte address space");
        overflowReported_ = true;
      }
    }
  }

  void pass1Instruction(Statement& st) {
    const InstructionDef& d = *st.inst;
    if (st.relativeMode != RelativeMode::Automatic) {
      if (st.extended) {
        err(st, st.mnemonicCol, "',p' and ',b' cannot be used with format 4");
        st.valid = false;
      }
      if (opt_.mode == ArchMode::Sic) {
        err(st, st.mnemonicCol, "',p' and ',b' are not available in SIC mode");
        st.valid = false;
      }
    }
    if (st.extended && !d.allowsExtended()) {
      err(st, st.mnemonicCol, st.mnemonic + " cannot use format 4");
      st.valid = false;
    }
    if (opt_.mode == ArchMode::Sic) {
      if (!d.sic) { err(st, st.mnemonicCol, st.mnemonic + " is not available in SIC mode"); st.valid = false; }
      if (st.extended) { err(st, st.mnemonicCol, "Format 4 is not available in SIC mode"); st.valid = false; }
      if (d.schema == OperandSchema::Memory && st.mode != AddrMode::Simple) {
        err(st, st.operandCol, "Immediate and indirect addressing are not available in SIC mode");
        st.valid = false;
      }
      st.size = 3;
      return;
    }
    st.size = d.format == 1 ? 1 : d.format == 2 ? 2 : (st.extended ? 4 : 3);
  }

  void pass1Directive(Statement& st) {
    if (!st.valid) { defineLabel(st, Value{lc_, 1}); return; }
    switch (*st.directive) {
      case DirectiveKind::Start:
        if (seenCode_) {
          err(st, st.mnemonicCol, "START must be the first statement");
        } else if (auto v = pass1Value(st, "START address", 0, limit_ - 1, false)) {
          lc_ = startAddr_ = highWater_ = *v;
          st.address = lc_;
          programName_ = st.label;
        }
        defineLabel(st, Value{lc_, 1});
        break;
      case DirectiveKind::End:
        ended_ = sawEnd_ = true;
        defineLabel(st, Value{lc_, 1});
        break;
      case DirectiveKind::Byte:
        for (const auto& it : st.items) st.size += it.isLiteral ? static_cast<i64>(it.literal.size()) : 1;
        defineLabel(st, Value{lc_, 1});
        break;
      case DirectiveKind::Word:
        st.size = 3 * static_cast<i64>(st.items.size());
        defineLabel(st, Value{lc_, 1});
        break;
      case DirectiveKind::Resb:
      case DirectiveKind::Resw: {
        const i64 unit = *st.directive == DirectiveKind::Resw ? 3 : 1;
        if (auto n = pass1Value(st, "Reservation count", 0, limit_ / unit, false)) st.size = *n * unit;
        defineLabel(st, Value{lc_, 1});
        break;
      }
      case DirectiveKind::Base:
      case DirectiveKind::Nobase:
        defineLabel(st, Value{lc_, 1});
        break;
      case DirectiveKind::Equ:
        if (st.label.empty()) err(st, st.mnemonicCol, "EQU requires a label");
        else if (auto v = eval(st, st.expr, false)) defineLabel(st, *v);
        break;
      case DirectiveKind::Org:
        if (st.expr) {
          if (auto v = pass1Value(st, "ORG address", 0, limit_, true)) {
            if (!orgReturn_) orgReturn_ = lc_;
            lc_ = *v;
          }
        } else if (orgReturn_) {
          lc_ = *orgReturn_;
          orgReturn_.reset();
        } else {
          err(st, st.mnemonicCol, "ORG without an operand has no previous location to restore");
        }
        st.address = lc_;
        defineLabel(st, Value{lc_, 1});
        break;
    }
  }

  // ======================= pass 2 ==========================================
  void pass2() {
    for (Statement& st : stmts_) {
      if (st.valid) {
        if (st.directive) pass2Directive(st);
        else if (st.inst) pass2Instruction(st);
      }
      appendListing(st);
    }
  }

  void emit(Statement& st, std::vector<byte_t> bytes) {
    for (std::size_t i = 0; i < bytes.size(); ++i) {
      const auto addr = static_cast<std::size_t>(st.address) + i;
      if (mem_.contains(addr)) {
        err(st, st.mnemonicCol, "Output overlaps previously assembled bytes at " + hex(static_cast<i64>(addr), 4));
        st.valid = false;
        return;
      }
      mem_.write(addr, bytes[i]);
    }
    st.bytes = std::move(bytes);
  }

  std::optional<i64> absolute(const Statement& st, const ExprPtr& e, const char* what, i64 lo, i64 hi) {
    auto v = eval(st, e, true);
    if (!v) return std::nullopt;
    if (v->relocatable()) { err(st, st.operandCol, std::string(what) + " must be absolute"); return std::nullopt; }
    if (v->value < lo || v->value > hi) {
      err(st, st.operandCol, std::string(what) + " " + std::to_string(v->value) + " is out of range (" +
                                 std::to_string(lo) + ".." + std::to_string(hi) + ")");
      return std::nullopt;
    }
    return v->value;
  }

  void pass2Directive(Statement& st) {
    switch (*st.directive) {
      case DirectiveKind::Byte: {
        std::vector<byte_t> out;
        for (const auto& item : st.items) {
          if (item.isLiteral) { out.insert(out.end(), item.literal.begin(), item.literal.end()); continue; }
          auto v = eval(st, item.expr, true);
          if (!v) return;
          if (v->value < -128 || v->value > 255) { err(st, st.operandCol, "BYTE value " + std::to_string(v->value) + " does not fit in 8 bits"); return; }
          out.push_back(static_cast<byte_t>(v->value & 0xFF));
        }
        emit(st, std::move(out));
        break;
      }
      case DirectiveKind::Word: {
        std::vector<byte_t> out;
        for (std::size_t i = 0; i < st.items.size(); ++i) {
          auto v = eval(st, st.items[i].expr, true);
          if (!v) return;
          if (v->value < -(i64{1} << 23) || v->value >= (i64{1} << 24)) {
            err(st, st.operandCol, "WORD value " + std::to_string(v->value) + " does not fit in 24 bits");
            return;
          }
          const auto u = static_cast<std::uint32_t>(v->value) & 0xFFFFFF;
          out.push_back(static_cast<byte_t>(u >> 16));
          out.push_back(static_cast<byte_t>(u >> 8));
          out.push_back(static_cast<byte_t>(u));
          if (v->relocatable()) relocs_.push_back({static_cast<std::size_t>(st.address) + 3 * i, 6});
        }
        emit(st, std::move(out));
        break;
      }
      case DirectiveKind::Base:
        if (auto v = eval(st, st.expr, true)) base_ = v->value;
        break;
      case DirectiveKind::Nobase:
        base_.reset();
        break;
      case DirectiveKind::End:
        if (st.expr) {
          if (auto v = eval(st, st.expr, true)) { entry_ = v->value; entrySet_ = true; }
        }
        break;
      default: break;  // START, RESB, RESW, EQU, ORG: no object bytes
    }
  }

  void pass2Instruction(Statement& st) {
    const InstructionDef& d = *st.inst;
    const byte_t op = d.opcode;
    switch (d.schema) {
      case OperandSchema::None:
        if (d.format == 1) emit(st, {op});
        else emit(st, {static_cast<byte_t>(opt_.mode == ArchMode::Sic ? op : op | 0x03), 0, 0});
        break;
      case OperandSchema::Reg:
        emit(st, {op, static_cast<byte_t>(st.reg1 << 4)});
        break;
      case OperandSchema::RegReg:
        emit(st, {op, static_cast<byte_t>((st.reg1 << 4) | st.reg2)});
        break;
      case OperandSchema::RegCount:
        if (auto n = absolute(st, st.expr, "Shift count", 1, 16))
          emit(st, {op, static_cast<byte_t>((st.reg1 << 4) | (*n - 1))});
        break;
      case OperandSchema::Number:
        if (auto n = absolute(st, st.expr, "Service number", 0, 15))
          emit(st, {op, static_cast<byte_t>(*n << 4)});
        break;
      case OperandSchema::Memory:
        if (opt_.mode == ArchMode::Sic) encodeSic(st); else encodeXe(st);
        break;
    }
  }

  void encodeSic(Statement& st) {
    auto v = eval(st, st.expr, true);
    if (!v) return;
    if (v->value < 0 || v->value > 0x7FFF) {
      err(st, st.operandCol, "Address " + std::to_string(v->value) + " does not fit SIC's 15-bit field");
      return;
    }
    const auto a = static_cast<unsigned>(v->value);
    emit(st, {st.inst->opcode, static_cast<byte_t>((st.indexed ? 0x80 : 0) | (a >> 8)),
              static_cast<byte_t>(a & 0xFF)});
  }

  void encodeXe(Statement& st) {
    auto v = eval(st, st.expr, true);
    if (!v) return;

    const unsigned n = st.mode != AddrMode::Immediate;
    const unsigned i = st.mode != AddrMode::Indirect;
    const byte_t op = static_cast<byte_t>(st.inst->opcode | (n << 1) | i);
    const unsigned x = st.indexed ? 1 : 0;
    const bool absImmediate = st.mode == AddrMode::Immediate && !v->relocatable();

    // ---- format 4: e=1, b=p=0, 20-bit field ---------------------------------
    if (st.extended) {
      if (v->value < 0 || v->value > 0xFFFFF) {
        err(st, st.operandCol, "Format-4 value " + std::to_string(v->value) + " is out of range (0.." + hex(0xFFFFF) + ")");
        return;
      }
      const auto a = static_cast<unsigned>(v->value);
      if (v->relocatable()) relocs_.push_back({static_cast<std::size_t>(st.address) + 1, 5});
      emit(st, {op, static_cast<byte_t>((x << 7) | 0x10 | (a >> 16)), static_cast<byte_t>(a >> 8),
                static_cast<byte_t>(a)});
      return;
    }

    // ---- format 3: pick b/p/direct --------------------------------------------
    unsigned b = 0, p = 0;
    i64 disp = 0;
    if (st.relativeMode != RelativeMode::Automatic && absImmediate) {
      err(st, st.mnemonicCol,
          "Forced relative addressing cannot be used with an absolute immediate constant");
      return;
    }
    if (absImmediate) {
      if (v->value < 0 || v->value > 4095) {
        err(st, st.operandCol, "Immediate constant " + std::to_string(v->value) +
                                   " does not fit in 12 bits; use +" + st.mnemonic + " for format 4");
        return;
      }
      disp = v->value;
    } else {
      const i64 ta = v->value;
      const i64 pcDisp = ta - (st.address + 3);
      if (st.relativeMode == RelativeMode::PcRelative) {
        if (pcDisp < -2048 || pcDisp > 2047) {
          err(st, st.operandCol, "Forced PC-relative displacement " + std::to_string(pcDisp) +
                                  " is out of range (-2048..2047)");
          return;
        }
        p = 1;
        disp = pcDisp;
      } else if (st.relativeMode == RelativeMode::BaseRelative) {
        if (!base_) {
          err(st, st.mnemonicCol, "Base-relative addressing (,b) requires an active BASE directive");
          return;
        }
        const i64 baseDisp = ta - *base_;
        if (baseDisp < 0 || baseDisp > 4095) {
          err(st, st.operandCol, "Forced base-relative displacement " + std::to_string(baseDisp) +
                                  " is out of range (0..4095)");
          return;
        }
        b = 1;
        disp = baseDisp;
      } else if (pcDisp >= -2048 && pcDisp <= 2047) {
        p = 1; disp = pcDisp;
      } else if (base_ && ta - *base_ >= 0 && ta - *base_ <= 4095) {
        b = 1; disp = ta - *base_;
      } else if (ta >= 0 && ta <= 4095) {
        disp = ta;
        if (v->relocatable())
          diags_.warning(st.line, st.operandCol, "Direct addressing of a relocatable operand cannot be relocated; consider +" + st.mnemonic);
      } else {
        err(st, st.operandCol, "Target " + hex(ta, 4) + " is out of format-3 range (PC displacement " +
                                   std::to_string(pcDisp) + (base_ ? ", base displacement " + std::to_string(ta - *base_) : ", no BASE active") +
                                   "); use +" + st.mnemonic + " for format 4");
        return;
      }
    }
    const unsigned field = static_cast<unsigned>(disp) & 0xFFF;
    emit(st, {op, static_cast<byte_t>((x << 7) | (b << 6) | (p << 5) | (field >> 8)),
              static_cast<byte_t>(field & 0xFF)});
  }

  void appendListing(const Statement& st) {
    std::string bytes;
    char buf[8];
    for (std::size_t k = 0; k < st.bytes.size() && k < 6; ++k) {
      std::snprintf(buf, sizeof buf, "%02X", st.bytes[k]);
      bytes += buf;
    }
    if (st.bytes.size() > 6) bytes += "..";
    char line[512];
    std::snprintf(line, sizeof line, "%04llX  %-14s  %s\n", static_cast<unsigned long long>(st.address),
                  bytes.c_str(), st.source.c_str());
    listing_ += line;
  }

  // ======================= state ===========================================
  const AssemblerOptions& opt_;
  i64 limit_ = 0;
  Diagnostics diags_;
  std::vector<Statement> stmts_;
  std::unordered_map<std::string, Symbol> symbols_;
  CodeMemory mem_;
  std::vector<Relocation> relocs_;
  std::string listing_, programName_;
  i64 lc_ = 0, startAddr_ = 0, highWater_ = 0, entry_ = 0;
  std::optional<i64> orgReturn_, base_;
  bool seenCode_ = false, ended_ = false, sawEnd_ = false, entrySet_ = false;
  bool warnedAfterEnd_ = false, overflowReported_ = false;
};

}  // namespace

AssemblyResult Assembler::assembleDetailed(std::string_view code) const {
  return Engine(options_, code).run();
}

void Assembler::clear() noexcept {
  last_ = {};
}

CodeMemory Assembler::assemble(std::string code) {
  AssemblyResult r = assembleDetailed(code);
  const bool ok = r.ok();  // must be evaluated before r.info is moved from
  last_ = std::move(r.info);
  if (!ok) throw AssemblyError(last_.diagnostics);
  return std::move(r.memory);
}

}  // namespace sicxe
