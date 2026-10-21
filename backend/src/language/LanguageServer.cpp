#include "language/LanguageServer.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdio>
#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string_view>
#include <unordered_set>

#include "assembler/isa.hpp"

namespace language {
namespace {

using json = nlohmann::json;

constexpr int kParseError = -32700;
constexpr int kInvalidRequest = -32600;
constexpr int kMethodNotFound = -32601;
constexpr int kInvalidParams = -32602;
constexpr int kInternalError = -32603;
constexpr std::size_t kMaxDocumentBytes = 1024 * 1024;

std::string upper(std::string_view value) {
    std::string result(value);
    std::transform(result.begin(), result.end(), result.begin(), [](unsigned char c) {
        return static_cast<char>(std::toupper(c));
    });
    return result;
}

bool identifier_character(char c) {
    const auto value = static_cast<unsigned char>(c);
    return std::isalnum(value) != 0 || c == '_';
}

bool identifier_start(char c) {
    const auto value = static_cast<unsigned char>(c);
    return std::isalpha(value) != 0 || c == '_';
}

std::string normalized_operation(std::string_view value) {
    const bool extended = !value.empty() && value.front() == '+';
    if (extended) value.remove_prefix(1);
    const std::size_t modifier = value.find(',');
    if (modifier != std::string_view::npos) value = value.substr(0, modifier);
    return std::string(extended ? "+" : "") + upper(value);
}

bool is_instruction_or_directive(std::string_view value) {
    std::string name = normalized_operation(value);
    if (!name.empty() && name.front() == '+') name.erase(name.begin());
    return sicxe::findInstruction(name) != nullptr || sicxe::findDirective(name).has_value();
}

std::string operand_schema(sicxe::OperandSchema schema) {
    switch (schema) {
        case sicxe::OperandSchema::None: return "no operands";
        case sicxe::OperandSchema::Memory: return "memory operand";
        case sicxe::OperandSchema::Reg: return "one register";
        case sicxe::OperandSchema::RegReg: return "two registers";
        case sicxe::OperandSchema::RegCount: return "register and shift count";
        case sicxe::OperandSchema::Number: return "numeric operand";
    }
    return "operand";
}

std::optional<std::string> operation_at_line(std::string_view prefix) {
    std::vector<std::string> fields;
    std::size_t position = 0;
    while (position < prefix.size()) {
        while (position < prefix.size() && std::isspace(static_cast<unsigned char>(prefix[position]))) ++position;
        if (position == prefix.size()) break;
        const std::size_t start = position;
        while (position < prefix.size() && !std::isspace(static_cast<unsigned char>(prefix[position]))) ++position;
        fields.emplace_back(prefix.substr(start, position - start));
    }

    if (fields.empty()) return std::nullopt;
    if (is_instruction_or_directive(fields.front())) return normalized_operation(fields.front());
    if (fields.size() > 1 && is_instruction_or_directive(fields[1])) return normalized_operation(fields[1]);
    return std::nullopt;
}

std::optional<std::string> relative_mode_operation_at_cursor(std::string_view prefix) {
    std::size_t position = prefix.size();
    while (position > 0 && std::isspace(static_cast<unsigned char>(prefix[position - 1]))) --position;
    const std::size_t tokenEnd = position;
    while (position > 0 && !std::isspace(static_cast<unsigned char>(prefix[position - 1]))) --position;
    const std::string_view token = prefix.substr(position, tokenEnd - position);
    if (!is_instruction_or_directive(token) || token.find(',') == std::string_view::npos)
        return std::nullopt;

    const std::string operation = normalized_operation(token);
    if (!operation.empty() && operation.front() == '+') return std::nullopt;
    std::string name = operation;
    const sicxe::InstructionDef* instruction = sicxe::findInstruction(upper(name));
    if (!instruction || instruction->format != 3 || instruction->schema != sicxe::OperandSchema::Memory)
        return std::nullopt;
    return upper(name);
}

std::optional<std::string_view> operand_prefix(std::string_view prefix) {
    std::size_t position = 0;
    auto nextField = [&](std::size_t& end) {
        while (position < prefix.size() && std::isspace(static_cast<unsigned char>(prefix[position]))) ++position;
        const std::size_t start = position;
        while (position < prefix.size() && !std::isspace(static_cast<unsigned char>(prefix[position]))) ++position;
        end = position;
        return prefix.substr(start, end - start);
    };

    std::size_t end = 0;
    const std::string_view first = nextField(end);
    if (first.empty()) return std::nullopt;
    if (!is_instruction_or_directive(first)) {
        const std::string_view second = nextField(end);
        if (second.empty() || !is_instruction_or_directive(second)) return std::nullopt;
    }
    while (position < prefix.size() && std::isspace(static_cast<unsigned char>(prefix[position]))) ++position;
    return prefix.substr(position);
}

bool looksLikeRegisterOperand(std::string_view operand) {
    while (!operand.empty() && std::isspace(static_cast<unsigned char>(operand.front()))) operand.remove_prefix(1);
    while (!operand.empty() && std::isspace(static_cast<unsigned char>(operand.back()))) operand.remove_suffix(1);
    if (operand.empty()) return false;
    if (operand.front() == '$') return true;
    return sicxe::registerNumber(upper(operand)).has_value();
}

bool hasMergedRegisterForm(std::string_view mnemonic) {
    const std::string name = upper(mnemonic);
    return name == "ADD" || name == "SUB" || name == "MUL" || name == "DIV" ||
           name == "COMP" || name == "TIX";
}

bool isMergedRegisterOpcode(std::string_view mnemonic) {
    const std::string name = upper(mnemonic);
    return name == "ADDR" || name == "SUBR" || name == "MULR" || name == "DIVR" ||
           name == "COMPR" || name == "TIXR";
}

struct CursorToken {
    std::string text;
    std::string_view line;
    int lineNumber = 0;
    int start = 0;
    int end = 0;
};

std::optional<CursorToken> token_at(const std::string& source, const json& position) {
    if (!position.is_object() || !position.contains("line") || !position["line"].is_number_integer() ||
        !position.contains("character") || !position["character"].is_number_integer())
        return std::nullopt;

    const int requestedLine = std::max(0, position["line"].get<int>());
    const int requestedCharacter = std::max(0, position["character"].get<int>());
    std::size_t lineStart = 0;
    int lineNumber = 0;
    while (lineNumber < requestedLine && lineStart < source.size()) {
        const std::size_t newline = source.find('\n', lineStart);
        if (newline == std::string::npos) return std::nullopt;
        lineStart = newline + 1;
        ++lineNumber;
    }
    if (lineNumber != requestedLine) return std::nullopt;

    std::size_t lineEnd = source.find('\n', lineStart);
    if (lineEnd == std::string::npos) lineEnd = source.size();
    if (lineEnd > lineStart && source[lineEnd - 1] == '\r') --lineEnd;
    const std::string_view line(source.data() + lineStart, lineEnd - lineStart);
    std::size_t cursor = std::min<std::size_t>(static_cast<std::size_t>(requestedCharacter), line.size());

    std::size_t begin = cursor;
    if (begin == line.size() || (begin > 0 && !identifier_character(line[begin]))) {
        if (begin > 0 && identifier_character(line[begin - 1])) --begin;
        else if (begin > 0 && line[begin - 1] == '$') --begin;
    }
    while (begin > 0 && identifier_character(line[begin - 1])) --begin;
    if (begin > 0 && line[begin - 1] == '$') --begin;
    std::size_t end = cursor;
    while (end < line.size() && identifier_character(line[end])) ++end;
    if (begin == end) return std::nullopt;
    const std::size_t nameStart = line[begin] == '$' ? begin + 1 : begin;
    if (nameStart == end) {
        if (line[begin] != '$') return std::nullopt;
    } else if (!identifier_start(line[nameStart])) {
        return std::nullopt;
    }

    return CursorToken{std::string(line.substr(begin, end - begin)), line, requestedLine,
                       static_cast<int>(begin), static_cast<int>(end)};
}

json lsp_range(int line, int column, int length) {
    const int startLine = std::max(0, line - 1);
    const int startColumn = std::max(0, column - 1);
    return {{"start", {{"line", startLine}, {"character", startColumn}}},
            {"end", {{"line", startLine}, {"character", startColumn + std::max(1, length)}}}};
}

json text_edit_range(int line, int start, int end) {
    return {{"start", {{"line", line}, {"character", start}}},
            {"end", {{"line", line}, {"character", end}}}};
}

json location(const std::string& uri, int line, int column, int length) {
    return {{"uri", uri}, {"range", lsp_range(line, column, length)}};
}

std::string directive_detail(std::string_view name) {
    const std::string directive = upper(name);
    if (directive == "START") return "Set the program start address.\n\n`START expression`";
    if (directive == "END") return "End the source program and optionally select its entry point.\n\n`END [expression]`";
    if (directive == "BYTE") return "Emit byte values or character and hexadecimal literals.\n\n`BYTE item, ...`";
    if (directive == "WORD") return "Emit three-byte values.\n\n`WORD expression, ...`";
    if (directive == "RESB") return "Reserve a number of bytes.\n\n`RESB expression`";
    if (directive == "RESW") return "Reserve a number of three-byte words.\n\n`RESW expression`";
    if (directive == "BASE") return "Set the base address used for base-relative format 3 addressing.\n\n`BASE expression`";
    if (directive == "NOBASE") return "Disable base-relative addressing.";
    if (directive == "EQU") return "Define a symbol from an expression.\n\n`label EQU expression`";
    if (directive == "ORG") return "Set the location counter, or restore its saved value.\n\n`ORG [expression]`";
    return {};
}

std::vector<std::string> register_names() {
    return {"A", "X", "L", "B", "S", "T", "F", "PC", "SW"};
}

} // namespace

json AssemblerLanguageSession::request_result(const json& id, json result) const {
    return {{"jsonrpc", "2.0"}, {"id", id}, {"result", std::move(result)}};
}

json AssemblerLanguageSession::request_error(const json& id, int code, std::string message) const {
    return {{"jsonrpc", "2.0"}, {"id", id},
            {"error", {{"code", code}, {"message", std::move(message)}}}};
}

void AssemblerLanguageSession::analyze(Document& document) {
    if (!document.analyzed) {
        document.analysis = sicxe::Assembler().assembleDetailed(document.text);
        document.analyzed = true;
    }
}

json AssemblerLanguageSession::publish_diagnostics(Document& document) {
    analyze(document);
    json diagnostics = json::array();
    for (const sicxe::Diagnostic& diagnostic : document.analysis.info.diagnostics) {
        if (!document.saved && diagnostic.severity == sicxe::Severity::Warning &&
            diagnostic.message == "Missing END directive")
            continue;

        const int startLine = std::max(0, diagnostic.line - 1);
        const int startColumn = diagnostic.column > 0 ? diagnostic.column - 1 : 0;
        diagnostics.push_back({
            {"range", {{"start", {{"line", startLine}, {"character", startColumn}}},
                        {"end", {{"line", startLine},
                                  {"character", startColumn + std::max(1, diagnostic.length)}}}}},
            {"severity", diagnostic.severity == sicxe::Severity::Error ? 1 : 2},
            {"source", "SIC/XE assembler"},
            {"message", diagnostic.message}});
    }
    return {{"jsonrpc", "2.0"},
            {"method", "textDocument/publishDiagnostics"},
            {"params", {{"uri", document.uri}, {"version", document.version},
                        {"diagnostics", std::move(diagnostics)}}}};
}

json AssemblerLanguageSession::completion(Document& document, const json& params) {
    analyze(document);
    if (!params.contains("position")) throw std::invalid_argument("position is required");
    const json& position = params["position"];
    auto token = token_at(document.text, position);
    if (!position.is_object() || !position.contains("line") || !position.contains("character"))
        throw std::invalid_argument("position must contain line and character");

    const int lineNumber = position["line"].get<int>();
    const int cursorCharacter = position["character"].get<int>();
    int tokenStart = std::max(0, cursorCharacter);
    int tokenEnd = tokenStart;
    std::string_view line;
    if (token) {
        tokenStart = token->start;
        tokenEnd = token->end;
        line = token->line;
    } else {
        // Empty operand positions still need their source line for context.
        const auto found = token_at(document.text, position);
        (void)found;
        std::size_t offset = 0;
        int currentLine = 0;
        while (currentLine < lineNumber && offset < document.text.size()) {
            const auto newline = document.text.find('\n', offset);
            if (newline == std::string::npos) break;
            offset = newline + 1;
            ++currentLine;
        }
        const auto end = document.text.find('\n', offset);
        const std::size_t lineEnd = end == std::string::npos ? document.text.size() : end;
        if (offset <= document.text.size() && lineEnd >= offset)
            line = std::string_view(document.text).substr(offset, lineEnd - offset);
        tokenStart = std::min<int>(tokenStart, static_cast<int>(line.size()));
        tokenEnd = tokenStart;
    }

    const std::string_view before = line.substr(0, static_cast<std::size_t>(std::min<int>(tokenStart, line.size())));
    const std::size_t comment = before.find(';');
    if (comment != std::string_view::npos || (!line.empty() && line.front() == '.'))
        return {{"isIncomplete", false}, {"items", json::array()}};

    const auto operation = operation_at_line(before);
    std::vector<json> candidates;
    const std::string typed = token ? upper(token->text) : std::string{};
    auto add = [&](std::string label, int kind, std::string detail, std::string insert = {}) {
        const std::string folded = upper(label);
        if (!typed.empty()) {
            std::string filter = typed;
            if (!filter.empty() && filter.front() == '+') filter.erase(filter.begin());
            const bool directMatch = folded.rfind(filter, 0) == 0;
            const bool unprefixedTypingMatch = !folded.empty() && folded.front() == '$' &&
                                               folded.substr(1).rfind(filter, 0) == 0;
            if (!directMatch && !unprefixedTypingMatch) return;
        }
        if (insert.empty()) insert = label;
        const std::string replacement = insert;
        candidates.push_back({{"label", std::move(label)}, {"kind", kind},
                              {"detail", std::move(detail)}, {"insertText", replacement},
                              {"textEdit", {{"range", text_edit_range(lineNumber, tokenStart, tokenEnd)},
                                             {"newText", replacement}}}});
    };

    if (relative_mode_operation_at_cursor(before)) {
        add("p", 14, "Force PC-relative format-3 addressing");
        add("b", 14, "Force BASE-relative format-3 addressing; requires BASE");
        return {{"isIncomplete", false}, {"items", std::move(candidates)}};
    }

    bool suggestTopLevel = !operation.has_value();
    if (suggestTopLevel) {
        for (const sicxe::InstructionDef& instruction : sicxe::instructionSet()) {
            if (isMergedRegisterOpcode(instruction.mnemonic)) continue;
            const std::string format = instruction.format == 3 ? "3/4" : std::to_string(instruction.format);
            std::string detail = "Format " + format + " · " + operand_schema(instruction.schema) + " · opcode " +
                                 std::to_string(instruction.opcode);
            if (hasMergedRegisterForm(instruction.mnemonic)) {
                if (instruction.mnemonic == "TIX") detail += " · register form: TIX $r";
                else detail += " · register form: " + std::string(instruction.mnemonic) + " $r1, $r2";
            }
            add(std::string(instruction.mnemonic), 14, std::move(detail));
        }
        const std::array<std::pair<const char*, const char*>, 10> directives = {{
            {"START", "Set program start address"}, {"END", "End source and select entry point"},
            {"BYTE", "Emit byte values or literals"}, {"WORD", "Emit three-byte values"},
            {"RESB", "Reserve bytes"}, {"RESW", "Reserve words"}, {"BASE", "Set base address"},
            {"NOBASE", "Disable base-relative addressing"}, {"EQU", "Define a symbol value"},
            {"ORG", "Set or restore the location counter"}}};
        for (const auto& [name, detail] : directives) add(name, 14, detail);
    } else {
        std::string op = *operation;
        if (!op.empty() && op.front() == '+') op.erase(op.begin());
        const std::string upperOp = upper(op);
        const sicxe::InstructionDef* instruction = sicxe::findInstruction(upperOp);
        const std::string_view operands = operand_prefix(before).value_or(std::string_view{});
        const std::size_t operandComma = operands.find(',');
        const bool commaAfterOperation = operandComma != std::string_view::npos;
        const std::string_view firstOperand = operands.substr(0, operandComma);
        const bool mergedRegisterOperand = hasMergedRegisterForm(upperOp) &&
            looksLikeRegisterOperand(commaAfterOperation ? firstOperand : operands);
        const bool mergedFirstOperand = hasMergedRegisterForm(upperOp) && !commaAfterOperation;
        const bool registerPosition = instruction &&
            (instruction->schema == sicxe::OperandSchema::Reg ||
             instruction->schema == sicxe::OperandSchema::RegReg ||
             (instruction->schema == sicxe::OperandSchema::RegCount && !commaAfterOperation));
        const bool memoryPosition = instruction && instruction->schema == sicxe::OperandSchema::Memory;
        const bool isDirective = sicxe::findDirective(upperOp).has_value();
        const bool noOperandDirective = upperOp == "NOBASE";
        const bool expressionPosition = (isDirective && !noOperandDirective) || memoryPosition ||
                                        (instruction && instruction->schema == sicxe::OperandSchema::Number);

        if (registerPosition || mergedRegisterOperand || mergedFirstOperand) {
            for (const std::string& name : register_names())
                add("$" + name, 6, "SIC/XE register (prefix register operands with '$')");
        }
        if (memoryPosition && commaAfterOperation && !mergedRegisterOperand) {
            add("$X", 6, "Index register (prefix register operands with '$')");
        } else if (expressionPosition && !mergedRegisterOperand) {
            std::unordered_set<std::string> emitted;
            for (const sicxe::SymbolLocation& symbol : document.analysis.info.symbolDefinitions) {
                const std::string key = upper(symbol.name);
                if (emitted.insert(key).second)
                    add(symbol.name, 6, "Symbol · value " + std::to_string(symbol.value));
            }
        }
    }

    std::stable_sort(candidates.begin(), candidates.end(), [](const json& left, const json& right) {
        return left["label"].get<std::string>() < right["label"].get<std::string>();
    });
    return {{"isIncomplete", false}, {"items", std::move(candidates)}};
}

json AssemblerLanguageSession::hover(Document& document, const json& params) {
    analyze(document);
    const auto token = token_at(document.text, params.value("position", json::object()));
    if (!token) return nullptr;
    const std::string spelling = upper(token->text);
    const bool hasRegisterPrefix = !spelling.empty() && spelling.front() == '$';
    const std::string name = hasRegisterPrefix ? spelling.substr(1) : spelling;

    if (!hasRegisterPrefix) {
        if (const sicxe::InstructionDef* instruction = sicxe::findInstruction(name)) {
            const std::string format = instruction->format == 3 ? "3 or 4" : std::to_string(instruction->format);
            char opcode[3]{};
            std::snprintf(opcode, sizeof opcode, "%02X", instruction->opcode);
            std::string value = "**" + name + "** — SIC/XE instruction\n\n" +
                                "Format: " + format + "  \n" +
                                "Operand: " + operand_schema(instruction->schema) + "  \n" +
                                "Opcode: `0x" + opcode + "`";
            if (hasMergedRegisterForm(name)) {
                value += "\n\nRegister form: `" + name +
                         (name == "TIX" ? " $r`" : " $r1, $r2`");
            }
            if (instruction->schema == sicxe::OperandSchema::Memory && instruction->format == 3) {
                value += "\n\nFormat 3 can force its relative mode with `" + name +
                         ",p operand` (PC-relative) or `" + name +
                         ",b operand` (base-relative; requires `BASE`).";
            }
            return {{"contents", {{"kind", "markdown"}, {"value", std::move(value)}}}};
        }
    }
    if (!hasRegisterPrefix) {
        if (const auto directive = sicxe::findDirective(name); directive.has_value()) {
            const std::string details = directive_detail(name);
            if (!details.empty()) return {{"contents", {{"kind", "markdown"}, {"value", details}}}};
        }
    }
    if (const auto reg = sicxe::registerNumber(name); reg.has_value()) {
        const std::string displayName = hasRegisterPrefix ? "$" + name : name;
        return {{"contents", {{"kind", "markdown"},
                              {"value", "**" + displayName + "** — register number `" + std::to_string(*reg) +
                                        (hasRegisterPrefix ? "`" : "`; write register operands with a `$` prefix.")}}}};
    }
    if (hasRegisterPrefix) return nullptr;
    for (const sicxe::SymbolLocation& symbol : document.analysis.info.symbolDefinitions) {
        if (upper(symbol.name) == name)
            return {{"contents", {{"kind", "markdown"},
                                  {"value", "**" + symbol.name + "** — symbol value `" +
                                               std::to_string(symbol.value) + "` (defined on line " +
                                               std::to_string(symbol.line) + ")"}}}};
    }
    return nullptr;
}

json AssemblerLanguageSession::definition(Document& document, const json& params) {
    analyze(document);
    const auto token = token_at(document.text, params.value("position", json::object()));
    if (!token) return nullptr;
    for (const sicxe::SymbolLocation& symbol : document.analysis.info.symbolDefinitions) {
        if (upper(symbol.name) == upper(token->text))
            return location(document.uri, symbol.line, symbol.column, symbol.length);
    }
    return nullptr;
}

json AssemblerLanguageSession::references(Document& document, const json& params) {
    analyze(document);
    const auto token = token_at(document.text, params.value("position", json::object()));
    if (!token) return json::array();
    const std::string target = upper(token->text);
    const auto definition = std::find_if(document.analysis.info.symbolDefinitions.begin(),
                                         document.analysis.info.symbolDefinitions.end(),
                                         [&](const sicxe::SymbolLocation& symbol) {
                                             return upper(symbol.name) == target;
                                         });
    if (definition == document.analysis.info.symbolDefinitions.end()) return json::array();

    const bool includeDeclaration = params.value("context", json::object()).value("includeDeclaration", false);
    json result = json::array();
    if (includeDeclaration)
        result.push_back(location(document.uri, definition->line, definition->column, definition->length));
    for (const sicxe::SymbolReference& reference : document.analysis.info.symbolReferences) {
        if (upper(reference.name) == target)
            result.push_back(location(document.uri, reference.line, reference.column, reference.length));
    }
    return result;
}

json AssemblerLanguageSession::rename(Document& document, const json& params) {
    analyze(document);
    const auto token = token_at(document.text, params.value("position", json::object()));
    if (!token) return nullptr;
    if (!params.contains("newName") || !params["newName"].is_string())
        throw std::invalid_argument("newName must be a string");
    const std::string newName = params["newName"].get<std::string>();
    if (newName.empty() || !identifier_start(newName.front()) ||
        !std::all_of(newName.begin() + 1, newName.end(), identifier_character))
        throw std::invalid_argument("newName must be a valid assembler identifier");
    const std::string normalized = upper(newName);
    if (sicxe::findInstruction(normalized) || sicxe::findDirective(normalized) || sicxe::registerNumber(normalized))
        throw std::invalid_argument("newName is reserved by the assembler");

    const std::string target = upper(token->text);
    const auto definition = std::find_if(document.analysis.info.symbolDefinitions.begin(),
                                         document.analysis.info.symbolDefinitions.end(),
                                         [&](const sicxe::SymbolLocation& symbol) {
                                             return upper(symbol.name) == target;
                                         });
    if (definition == document.analysis.info.symbolDefinitions.end()) return nullptr;

    json edits = json::array();
    edits.push_back({{"range", lsp_range(definition->line, definition->column, definition->length)},
                     {"newText", newName}});
    for (const sicxe::SymbolReference& reference : document.analysis.info.symbolReferences) {
        if (upper(reference.name) == target)
            edits.push_back({{"range", lsp_range(reference.line, reference.column, reference.length)},
                             {"newText", newName}});
    }
    return {{"changes", {{document.uri, std::move(edits)}}}};
}

std::vector<json> AssemblerLanguageSession::handle(const json& message) {
    std::vector<json> output;
    if (!message.is_object()) {
        output.push_back(request_error(nullptr, kInvalidRequest, "JSON-RPC message must be an object"));
        return output;
    }
    const json id = message.value("id", json(nullptr));
    const bool hasId = message.contains("id");
    if (!message.contains("jsonrpc") || message["jsonrpc"] != "2.0" ||
        !message.contains("method") || !message["method"].is_string()) {
        if (hasId) output.push_back(request_error(id, kInvalidRequest, "Invalid JSON-RPC request"));
        return output;
    }

    const std::string method = message["method"].get<std::string>();
    const json params = message.value("params", json::object());
    auto respond = [&](json result) {
        if (hasId) output.push_back(request_result(id, std::move(result)));
    };
    auto docUri = [&]() -> std::string {
        if (!params.is_object() || !params.contains("textDocument") ||
            !params["textDocument"].is_object() || !params["textDocument"].contains("uri") ||
            !params["textDocument"]["uri"].is_string())
            throw std::invalid_argument("textDocument.uri is required");
        return params["textDocument"]["uri"].get<std::string>();
    };
    auto findDocument = [&]() -> Document& {
        const std::string uri = docUri();
        auto found = m_documents.find(uri);
        if (found == m_documents.end()) throw std::invalid_argument("document is not open");
        return found->second;
    };

    try {
        if (method == "initialize") {
            json instructions = json::array();
            for (const sicxe::InstructionDef& instruction : sicxe::instructionSet())
                instructions.push_back(instruction.mnemonic);
            const json directives = {"START", "END", "BYTE", "WORD", "RESB", "RESW", "BASE", "NOBASE", "EQU", "ORG"};
            const json registers = register_names();
            const json capabilities = {
                {"textDocumentSync", {{"openClose", true}, {"change", 1}, {"save", {{"includeText", false}}}}},
                {"completionProvider", {{"resolveProvider", false}, {"triggerCharacters", {" ", ",", "#", "@", "+", "$"}}}},
                {"hoverProvider", true},
                {"definitionProvider", true},
                {"referencesProvider", true},
                {"renameProvider", true},
                {"experimental", {{"sicxe", {{"instructions", std::move(instructions)},
                                                {"directives", directives},
                                                {"registers", registers}}}}}};
            respond({{"capabilities", capabilities},
                     {"serverInfo", {{"name", "sicxe-assembler-language-server"}, {"version", "1.0"}}}});
        } else if (method == "initialized" || method == "$/cancelRequest" || method == "exit") {
            return output;
        } else if (method == "shutdown") {
            m_shutdown = true;
            respond(nullptr);
        } else if (method == "textDocument/didOpen") {
            if (!params.contains("textDocument") || !params["textDocument"].is_object())
                throw std::invalid_argument("textDocument is required");
            const json& td = params["textDocument"];
            if (!td.contains("uri") || !td["uri"].is_string() || !td.contains("text") || !td["text"].is_string())
                throw std::invalid_argument("textDocument.uri and text are required");
            if (td["text"].get_ref<const std::string&>().size() > kMaxDocumentBytes)
                throw std::invalid_argument("document exceeds the 1 MiB language service limit");
            Document document;
            document.uri = td["uri"].get<std::string>();
            document.text = td["text"].get<std::string>();
            document.version = td.value("version", 1);
            m_documents[document.uri] = std::move(document);
            output.push_back(publish_diagnostics(m_documents.at(td["uri"].get<std::string>())));
        } else if (method == "textDocument/didChange") {
            Document& document = findDocument();
            const int version = params.at("textDocument").value("version", document.version + 1);
            if (version <= document.version) return output;
            if (!params.contains("contentChanges") || !params["contentChanges"].is_array() || params["contentChanges"].empty())
                throw std::invalid_argument("contentChanges must contain a full document change");
            const json& change = params["contentChanges"].back();
            if (!change.contains("text") || !change["text"].is_string())
                throw std::invalid_argument("full document change must contain text");
            if (change["text"].get_ref<const std::string&>().size() > kMaxDocumentBytes)
                throw std::invalid_argument("document exceeds the 1 MiB language service limit");
            document.text = change["text"].get<std::string>();
            document.version = version;
            document.saved = false;
            document.analyzed = false;
            output.push_back(publish_diagnostics(document));
        } else if (method == "textDocument/didSave") {
            Document& document = findDocument();
            if (params.contains("text") && params["text"].is_string()) {
                document.text = params["text"].get<std::string>();
                document.analyzed = false;
            }
            document.saved = true;
            output.push_back(publish_diagnostics(document));
        } else if (method == "textDocument/didClose") {
            const std::string uri = docUri();
            m_documents.erase(uri);
            output.push_back({{"jsonrpc", "2.0"}, {"method", "textDocument/publishDiagnostics"},
                              {"params", {{"uri", uri}, {"diagnostics", json::array()}}}});
        } else if (method == "textDocument/completion" || method == "textDocument/hover" ||
                   method == "textDocument/definition" || method == "textDocument/references" ||
                   method == "textDocument/rename") {
            Document& document = findDocument();
            if (method == "textDocument/completion") respond(completion(document, params));
            else if (method == "textDocument/hover") respond(hover(document, params));
            else if (method == "textDocument/definition") respond(definition(document, params));
            else if (method == "textDocument/references") respond(references(document, params));
            else respond(rename(document, params));
        } else {
            if (hasId) output.push_back(request_error(id, kMethodNotFound, "Method not found: " + method));
        }
    } catch (const std::invalid_argument& error) {
        if (hasId) output.push_back(request_error(id, kInvalidParams, error.what()));
    } catch (const std::exception& error) {
        if (hasId) output.push_back(request_error(id, kInternalError, error.what()));
    } catch (...) {
        if (hasId) output.push_back(request_error(id, kInternalError, "Internal language service error"));
    }
    return output;
}

} // namespace language
