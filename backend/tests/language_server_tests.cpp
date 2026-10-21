#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <string>

#include "language/LanguageServer.hpp"

using json = nlohmann::json;

namespace {

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << '\n';
        std::exit(EXIT_FAILURE);
    }
}

json send(language::AssemblerLanguageSession& session, const json& message) {
    auto responses = session.handle(message);
    require(!responses.empty(), "expected a response");
    return responses.front();
}

json open_document(language::AssemblerLanguageSession& session, std::string text, int version = 1) {
    auto responses = send(session, {{"jsonrpc", "2.0"}, {"method", "textDocument/didOpen"},
                                    {"params", {{"textDocument", {{"uri", "sicxe://test/main.asm"},
                                                                     {"languageId", "sicxe"},
                                                                     {"version", version},
                                                                     {"text", std::move(text)}}}}}});
    return responses.at("params");
}

void test_initialize_and_diagnostics() {
    language::AssemblerLanguageSession session;
    const json initialized = send(session, {{"jsonrpc", "2.0"}, {"id", 1}, {"method", "initialize"}});
    require(initialized.at("result").at("capabilities").at("textDocumentSync").at("change") == 1,
            "initialize advertises full document synchronization");
    require(initialized.at("result").at("capabilities").at("renameProvider") == true,
            "initialize advertises symbol rename");

    const json diagnosticMessage = open_document(session, "P START 0\n LDA MISSING\n");
    require(diagnosticMessage.at("version") == 1, "diagnostics carry document version");
    const auto& diagnostics = diagnosticMessage.at("diagnostics");
    const auto missing = std::find_if(diagnostics.begin(), diagnostics.end(), [](const json& item) {
        return item.at("message").get<std::string>().find("Undefined symbol 'MISSING'") != std::string::npos;
    });
    require(missing != diagnostics.end(), "undefined symbols are reported from the assembler");
    require(missing->at("severity") == 1, "assembler errors map to LSP error severity");
    require(missing->at("range").at("start").at("line") == 1, "diagnostic line maps to LSP zero-based line");
    require(missing->at("range").at("start").at("character") == 5,
            "diagnostic column maps to LSP zero-based character");
    require(std::none_of(diagnostics.begin(), diagnostics.end(), [](const json& item) {
        return item.at("message") == "Missing END directive";
    }), "missing END warning is suppressed while the document is being edited");

    const json saved = send(session, {{"jsonrpc", "2.0"}, {"method", "textDocument/didSave"},
                                     {"params", {{"textDocument", {{"uri", "sicxe://test/main.asm"}}}}}});
    require(std::any_of(saved.at("params").at("diagnostics").begin(),
                        saved.at("params").at("diagnostics").end(), [](const json& item) {
        return item.at("message") == "Missing END directive";
    }), "missing END warning is shown after save");
}

void test_completion_and_versioned_changes() {
    language::AssemblerLanguageSession session;
    open_document(session, "P START 0\nTARGET WORD 1\n LDA \n END P\n");
    const json completed = send(session, {{"jsonrpc", "2.0"}, {"id", 2},
                                         {"method", "textDocument/completion"},
                                         {"params", {{"textDocument", {{"uri", "sicxe://test/main.asm"}}},
                                                     {"position", {{"line", 2}, {"character", 5}}}}}});
    const auto& items = completed.at("result").at("items");
    require(std::any_of(items.begin(), items.end(), [](const json& item) { return item.at("label") == "TARGET"; }),
            "memory operand completion includes defined symbols");
    require(std::any_of(items.begin(), items.end(), [](const json& item) { return item.at("label") == "X"; }) == false,
            "X is suggested only after an index comma");

    const json changed = send(session, {{"jsonrpc", "2.0"}, {"method", "textDocument/didChange"},
                                       {"params", {{"textDocument", {{"uri", "sicxe://test/main.asm"}, {"version", 2}}},
                                                   {"contentChanges", json::array({{{"text", "P START 0\n END P\n"}}})}}}});
    require(changed.at("params").at("version") == 2, "change publishes diagnostics for the new version");
    require(changed.at("params").at("diagnostics").empty(), "valid updated document clears old diagnostics");

    const auto stale = session.handle({{"jsonrpc", "2.0"}, {"method", "textDocument/didChange"},
                                       {"params", {{"textDocument", {{"uri", "sicxe://test/main.asm"}, {"version", 1}}},
                                                   {"contentChanges", json::array({{{"text", "BROKEN"}}})}}}});
    require(stale.empty(), "stale document changes are ignored");
}

void test_hover_definition_references_and_rename() {
    language::AssemblerLanguageSession session;
    open_document(session, "MAIN START 0\nLOOP RSUB\n J LOOP\n END LOOP\n");
    const json document = {{"uri", "sicxe://test/main.asm"}};
    const json position = {{"line", 2}, {"character", 5}};
    const json params = {{"textDocument", document}, {"position", position}};

    const json hovered = send(session, {{"jsonrpc", "2.0"}, {"id", 3},
                                       {"method", "textDocument/hover"}, {"params", params}});
    require(hovered.at("result").at("contents").at("value").get<std::string>().find("symbol value") != std::string::npos,
            "hover describes a resolved symbol");

    const json definition = send(session, {{"jsonrpc", "2.0"}, {"id", 4},
                                          {"method", "textDocument/definition"}, {"params", params}});
    require(definition.at("result").at("range").at("start").at("line") == 1,
            "definition points to the symbol declaration");

    json referenceParams = params;
    referenceParams["context"] = {{"includeDeclaration", true}};
    const json references = send(session, {{"jsonrpc", "2.0"}, {"id", 5},
                                          {"method", "textDocument/references"}, {"params", referenceParams}});
    require(references.at("result").size() == 3, "references include the declaration and both uses");

    json renameParams = params;
    renameParams["newName"] = "AGAIN";
    const json renamed = send(session, {{"jsonrpc", "2.0"}, {"id", 6},
                                       {"method", "textDocument/rename"}, {"params", renameParams}});
    require(renamed.at("result").at("changes").at("sicxe://test/main.asm").size() == 3,
            "rename edits declaration and all references");

    renameParams["newName"] = "LDA";
    const json rejected = send(session, {{"jsonrpc", "2.0"}, {"id", 7},
                                        {"method", "textDocument/rename"}, {"params", renameParams}});
    require(rejected.contains("error"), "rename rejects reserved instruction names");
}

} // namespace

int main() {
    test_initialize_and_diagnostics();
    test_completion_and_versioned_changes();
    test_hover_definition_references_and_rename();
    std::cout << "Language server protocol and feature checks passed\n";
}
