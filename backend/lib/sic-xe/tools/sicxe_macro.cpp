// sicxe_macro: runs the macro processor on a source file and writes MASMAPRG.ASM.
//   sicxe_macro <input> [-o <dir>] [--tables] [--trace]
// Exit codes: 0 ok, 1 macro error (MASMAPRG.ASM is still written, so the partial
// expansion can be inspected), 2 usage error.
#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "assembler/macro_processor.hpp"

using namespace sicxe;

namespace {

const char* const kUsage = "usage: sicxe_macro <input> [-o <dir>] [--tables] [--trace]";

// Display width: the tables hold UTF-8 text (—, ·, →, ×), so count code points.
std::size_t width(const std::string& s) {
  std::size_t n = 0;
  for (unsigned char c : s)
    if ((c & 0xC0) != 0x80) ++n;
  return n;
}

std::string pad(const std::string& s, std::size_t w) {
  return s + std::string(w > width(s) ? w - width(s) : 0, ' ');
}

// Tabs and stray carriage returns would break the columns.
std::string flat(std::string s) {
  for (char& c : s)
    if (c == '\t' || c == '\r') c = ' ';
  return s;
}

std::string serialName(int serial) {
  char buf[16];
  std::snprintf(buf, sizeof buf, "#%03d", serial);
  return buf;
}

// The Lines column, as the UI shows it: the source lines of the definition, from its
// MCDEFN line to its MCEND line ("2-7", as in "SOMA — defined at line 2"), or the serial
// of the expansion that created the macro ("#004").
std::string nameLines(const MacroDefinition& d) {
  if (d.originSerial > 0) return serialName(d.originSerial);
  const int first = d.originSourceLine;
  const int last = d.bodySourceLines.empty() ? 0 : d.bodySourceLines.back();
  if (last > first) return std::to_string(first) + "-" + std::to_string(last);
  return std::to_string(first);
}

using Row = std::vector<std::string>;

// Prints a header, a rule and the rows with every column padded to its widest cell.
void printTable(std::ostream& out, const Row& header, const std::vector<Row>& rows) {
  std::vector<std::size_t> w;
  for (const Row& r : rows) {
    if (w.size() < r.size()) w.resize(r.size(), 0);
  }
  w.resize(std::max(w.size(), header.size()), 0);
  for (std::size_t i = 0; i < header.size(); ++i) w[i] = width(header[i]);
  for (const Row& r : rows)
    for (std::size_t i = 0; i < r.size(); ++i) w[i] = std::max(w[i], width(r[i]));

  auto line = [&](const Row& r) {
    std::string s;
    for (std::size_t i = 0; i < r.size(); ++i) {
      if (i + 1 == r.size()) s += r[i];
      else s += pad(r[i], w[i]) + "  ";
    }
    out << s << '\n';
  };
  line(header);
  std::string rule;
  for (std::size_t i = 0; i < header.size(); ++i) {
    rule += std::string(w[i], '-');
    if (i + 1 < header.size()) rule += "  ";
  }
  out << rule << '\n';
  for (const Row& r : rows) line(r);
}

void printTables(std::ostream& out, const MacroResult& r) {
  out << "Name table\n";
  std::vector<Row> rows;
  for (const MacroName& n : r.names) {
    const MacroDefinition& d = r.definitions[static_cast<std::size_t>(n.definition)];
    rows.push_back({n.name, flat(d.prototype), nameLines(d)});
  }
  printTable(out, {"Name", "Prototype", "Lines"}, rows);

  out << "\nDefinition table\n";
  for (const MacroDefinition& d : r.definitions) {
    out << '\n' << d.name << " \xE2\x80\x94 ";
    if (d.originSerial > 0) out << "created by expansion " << serialName(d.originSerial);
    else out << "defined at line " << d.originSourceLine;
    if (!d.active) out << "  (redefined)";
    out << '\n';
    const std::size_t digits = std::to_string(d.displayBody.size()).size();
    for (std::size_t i = 0; i < d.displayBody.size(); ++i) {
      std::string n = std::to_string(i + 1);
      out << "  " << std::string(digits - n.size(), ' ') << n << "  " << flat(d.displayBody[i]) << '\n';
    }
  }

  out << "\nExpansions\n";
  rows.clear();
  for (const Expansion& e : r.expansions) {
    std::string args;
    for (const Actual& a : e.actuals) {
      if (!args.empty()) args += ' ';
      args += "#" + std::to_string(a.index) + "=" + flat(a.value);
    }
    const int indent = std::max(0, e.depth - 1) * 2;
    rows.push_back({std::string(static_cast<std::size_t>(indent), ' ') + serialName(e.serial), e.macro, args,
                    std::to_string(e.outputFrom) + "-" + std::to_string(e.outputTo)});
  }
  printTable(out, {"#", "Macro", "Arguments", "Output"}, rows);
}

std::string actionText(const MacroResult& r, const TraceStep& s) {
  const auto defName = [&](int index) {
    return r.definitions[static_cast<std::size_t>(index)].name;
  };
  switch (s.action) {
    case TraceAction::Copy: return "copy \xE2\x86\x92 output " + std::to_string(s.targetOutput);
    case TraceAction::DefineStart: return "define start";
    case TraceAction::Prototype:
      return s.targetBodyLine > 0 ? "prototype \xE2\x86\x92 " + defName(s.targetDefinition) + " line " +
                                        std::to_string(s.targetBodyLine)
                                  : "prototype";
    case TraceAction::Store:
      return s.targetBodyLine > 0 ? "store \xE2\x86\x92 " + defName(s.targetDefinition) + " line " +
                                        std::to_string(s.targetBodyLine)
                                  : "store";
    case TraceAction::DefineEnd:
      return s.targetBodyLine > 0 ? "define end \xE2\x86\x92 " + defName(s.targetDefinition) + " line " +
                                        std::to_string(s.targetBodyLine)
                                  : "define end";
    case TraceAction::Call: return "call \xE2\x86\x92 expansion " + serialName(s.targetSerial);
    case TraceAction::ReadPrototype: return "read prototype";
    case TraceAction::ExpansionEnd: return "end of expansion";
    case TraceAction::Error: return "error";
  }
  return "";
}

void printTrace(std::ostream& out, const MacroResult& r) {
  out << "Trace\n";
  std::vector<Row> rows;
  for (const TraceStep& s : r.trace.steps) {
    const std::string read =
        (s.fromExpansion ? serialName(s.serial) + " \xC2\xB7 " : std::string()) + "line " + std::to_string(s.line);
    std::string e = s.e ? "true" : "false";
    if (s.depth > 1) e += " \xC3\x97" + std::to_string(s.depth);
    rows.push_back({std::to_string(s.step), read, std::to_string(s.d), e, flat(s.text), actionText(r, s)});
  }
  printTable(out, {"Step", "Read", "d", "e", "Text", "Action"}, rows);
  if (r.trace.truncated) out << "(trace truncated)\n";
}

}  // namespace

int main(int argc, char** argv) {
  std::string input, outDir = ".";
  bool tables = false, trace = false;
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    if (a == "--tables") tables = true;
    else if (a == "--trace") trace = true;
    else if (a == "-o" && i + 1 < argc) outDir = argv[++i];
    else if (!a.empty() && a[0] == '-') {
      std::cerr << "sicxe_macro: unknown option '" << a << "'\n" << kUsage << '\n';
      return 2;
    } else if (input.empty()) input = a;
    else {
      std::cerr << "sicxe_macro: unexpected argument '" << a << "'\n" << kUsage << '\n';
      return 2;
    }
  }
  if (input.empty()) {
    std::cerr << kUsage << '\n';
    return 2;
  }

  std::ifstream in(input, std::ios::binary);
  if (!in) {
    std::cerr << "sicxe_macro: cannot read '" << input << "'\n" << kUsage << '\n';
    return 2;
  }
  std::ostringstream buffer;
  buffer << in.rdbuf();

  const MacroResult result = MacroProcessor().process(buffer.str());

  for (const Diagnostic& d : result.diagnostics)
    std::cerr << input << ':' << d.toString() << '\n';

  std::error_code ec;
  std::filesystem::create_directories(outDir, ec);
  if (ec) {
    std::cerr << "sicxe_macro: cannot create '" << outDir << "': " << ec.message() << '\n';
    return 2;
  }
  const std::filesystem::path target = std::filesystem::path(outDir) / std::string(kMacroOutputFile);
  std::ofstream out(target, std::ios::binary);
  if (!out) {
    std::cerr << "sicxe_macro: cannot write '" << target.string() << "'\n";
    return 2;
  }
  out.write(result.text.data(), static_cast<std::streamsize>(result.text.size()));
  const bool written = out.good();
  out.close();
  if (!written || out.fail()) {
    std::cerr << "sicxe_macro: error writing '" << target.string() << "'\n";
    return 1;
  }

  if (tables) printTables(std::cout, result);
  if (trace) {
    if (tables) std::cout << '\n';
    printTrace(std::cout, result);
  }
  return result.ok() ? 0 : 1;
}
