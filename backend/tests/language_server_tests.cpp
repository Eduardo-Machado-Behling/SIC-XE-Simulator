#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
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

// ---- macros (spec 5): the document is expanded before it is assembled ----

std::string demo_source() {
    std::ifstream in(SICXE_DEMO_ASM, std::ios::binary);
    require(in.good(), "the macro demo program can be read");
    std::ostringstream text;
    text << in.rdbuf();
    return text.str();
}

json request(language::AssemblerLanguageSession& session, int id, const std::string& method, json params) {
    return send(session, {{"jsonrpc", "2.0"}, {"id", id}, {"method", method}, {"params", std::move(params)}});
}

json cursor(int line, int character) {
    return {{"textDocument", {{"uri", "sicxe://test/main.asm"}}},
            {"position", {{"line", line}, {"character", character}}}};
}

bool starts_at(const json& range, int line, int character) {
    return range.at("start").at("line") == line && range.at("start").at("character") == character;
}

bool has_edit(const json& edits, int line, int character, int end) {
    return std::any_of(edits.begin(), edits.end(), [&](const json& edit) {
        return starts_at(edit.at("range"), line, character) && edit.at("range").at("end").at("line") == line &&
               edit.at("range").at("end").at("character") == end;
    });
}

void test_macro_source_has_no_false_errors() {
    language::AssemblerLanguageSession session;
    const json initialized = send(session, {{"jsonrpc", "2.0"}, {"id", 1}, {"method", "initialize"}});
    require(initialized.at("result").at("capabilities").at("experimental").at("sicxe").at("macroDirectives") ==
                json::array({"MCDEFN", "MCEND"}),
            "initialize advertises the macro directives");

    const json diagnostics = open_document(session, demo_source()).at("diagnostics");
    require(std::none_of(diagnostics.begin(), diagnostics.end(), [](const json& item) {
        return item.at("severity") == 1;
    }), "the macro demo program publishes no errors");

    // An unclosed MCDEFN swallows VALOR: as in a Run, the assembler's errors are not shown.
    const json unclosed = open_document(session,
        "PROG    START 0\n        LDA     VALOR\n        MCDEFN\n        M\nVALOR   WORD    1\n        END     PROG\n",
        2).at("diagnostics");
    require(unclosed.size() == 1 && unclosed.front().at("message") == "MCDEFN without MCEND" &&
                unclosed.front().at("source") == "SIC/XE macro processor" &&
                starts_at(unclosed.front().at("range"), 2, 8),
            "a macro processor error is published alone, at its place in the document");
}

void test_error_in_expansion_lands_on_call_line() {
    language::AssemblerLanguageSession session;
    const json diagnostics = open_document(session,
        "PROG    START 0\n        MCDEFN\n        CARREGA\n        LDA NAOEXISTE\n        MCEND\n"
        "        LDA #1\nAQUI    CARREGA\n        END PROG\n").at("diagnostics");
    require(diagnostics.size() == 1, "only the error of the expanded body is reported");
    const json& error = diagnostics.front();
    const std::string message = error.at("message").get<std::string>();
    require(message.rfind("In expansion of CARREGA (#001, MASMAPRG.ASM:5): ", 0) == 0,
            "an expansion error names the expansion and its MASMAPRG.ASM line");
    require(message.find("Undefined symbol 'NAOEXISTE'") != std::string::npos,
            "an expansion error keeps the assembler message");
    require(error.at("severity") == 1, "an expansion error is an error");
    require(starts_at(error.at("range"), 6, 8) && error.at("range").at("end").at("character") == 15,
            "an expansion error lands on the macro name of the call line");
}

void test_verbatim_line_after_definition_keeps_position() {
    language::AssemblerLanguageSession session;
    const json diagnostics = open_document(session,
        "PROG    START 0\n        MCDEFN\n        M\n        LDA #1\n        MCEND\n        M\n"
        "        LDA     NAOEXISTE\nVALOR   WORD    1\n        LDA     VALOR\n        END     PROG\n").at("diagnostics");
    require(diagnostics.size() == 1, "a definition and its call add no diagnostics");
    require(diagnostics.front().at("message").get<std::string>().find("Undefined symbol 'NAOEXISTE'") == 0,
            "a verbatim line keeps the assembler message");
    require(starts_at(diagnostics.front().at("range"), 6, 16),
            "a verbatim line after a definition keeps its line and column");

    const json definition = request(session, 2, "textDocument/definition", cursor(8, 18));
    require(starts_at(definition.at("result").at("range"), 7, 0),
            "a symbol defined after a definition is found on its own line");
    json referenceParams = cursor(8, 18);
    referenceParams["context"] = {{"includeDeclaration", true}};
    const json references = request(session, 3, "textDocument/references", referenceParams).at("result");
    require(references.size() == 2 && starts_at(references.at(1).at("range"), 8, 16),
            "a reference after a definition keeps its line and column");
}

void test_rename_refuses_synthetic_symbol() {
    // FIM003 exists only in the third expansion (MAXIMO's FIM.SER): the verbatim J gives the
    // cursor something to point at.
    std::string demo = demo_source();
    const std::size_t halt = demo.find("        HALT\n");
    require(halt != std::string::npos, "the demo program has a HALT line");
    demo.insert(halt, "        J       FIM003\n");

    language::AssemblerLanguageSession session;
    open_document(session, demo);
    const json definition = request(session, 2, "textDocument/definition", cursor(33, 17));
    require(starts_at(definition.at("result").at("range"), 30, 8) &&
                definition.at("result").at("range").at("end").at("character") == 14,
            "a symbol produced by an expansion is defined at the macro name of its call");

    json renameParams = cursor(33, 17);
    renameParams["newName"] = "FIM";
    const json refused = request(session, 3, "textDocument/rename", renameParams);
    require(refused.contains("error") && refused.at("error").at("code") == -32602,
            "renaming a symbol produced by an expansion is an invalid-params error");
    require(refused.at("error").at("message") == "Cannot rename a symbol produced by a macro expansion",
            "the refusal says why");

    // N is written on the call lines: every expansion occurrence is edited there, once.
    renameParams = cursor(35, 0);
    renameParams["newName"] = "NUM";
    const json edits = request(session, 4, "textDocument/rename", renameParams)
                           .at("result").at("changes").at("sicxe://test/main.asm");
    require(edits.size() == 4 && has_edit(edits, 35, 0, 1) && has_edit(edits, 29, 14, 15) &&
                has_edit(edits, 30, 17, 18) && has_edit(edits, 32, 14, 15),
            "rename edits the declaration and each call line that passes the symbol");

    // A body line that names a symbol is edited once, however many times it was expanded.
    language::AssemblerLanguageSession bodySession;
    open_document(bodySession,
        "PROG    START 0\n        MCDEFN\n        SOMA    X\n        LDA     X\n        ADD     TOTAL\n"
        "        STA     TOTAL\n        MCEND\n        SOMA    VALOR\n        SOMA    VALOR\n"
        "TOTAL   WORD    0\nVALOR   WORD    1\n        END     PROG\n");
    renameParams = cursor(9, 0);
    renameParams["newName"] = "SUM";
    const json bodyEdits = request(bodySession, 5, "textDocument/rename", renameParams)
                               .at("result").at("changes").at("sicxe://test/main.asm");
    require(bodyEdits.size() == 3 && has_edit(bodyEdits, 9, 0, 5) && has_edit(bodyEdits, 4, 16, 21) &&
                has_edit(bodyEdits, 5, 16, 21),
            "rename edits the definition body line, not each expansion of it");
    renameParams = cursor(10, 0);
    renameParams["newName"] = "VAL";
    const json callEdits = request(bodySession, 6, "textDocument/rename", renameParams)
                               .at("result").at("changes").at("sicxe://test/main.asm");
    require(callEdits.size() == 3 && has_edit(callEdits, 10, 0, 5) && has_edit(callEdits, 7, 16, 21) &&
                has_edit(callEdits, 8, 16, 21),
            "a symbol passed to a formal is edited on each call line, not in the body");

    for (const char* reserved : {"MCDEFN", "mcend", "SOMA"}) {
        renameParams["newName"] = reserved;
        const json rejected = request(bodySession, 7, "textDocument/rename", renameParams);
        require(rejected.contains("error") && rejected.at("error").at("code") == -32602 &&
                    rejected.at("error").at("message") == "newName is reserved by the macro processor",
                "rename rejects MCDEFN, MCEND and macro names");
    }

    // A symbol named like a formal: the body's V is the parameter, and the V of "V=" is the keyword.
    language::AssemblerLanguageSession formalSession;
    open_document(formalSession,
        "PROG    START 0\n        MCDEFN\n        CARGA   V=\n        LDA     V\n        MCEND\n"
        "        CARGA   V=V\nV       WORD    1\n        END     PROG\n");
    renameParams = cursor(6, 0);
    renameParams["newName"] = "W";
    const json formalEdits = request(formalSession, 8, "textDocument/rename", renameParams)
                                 .at("result").at("changes").at("sicxe://test/main.asm");
    require(formalEdits.size() == 2 && has_edit(formalEdits, 6, 0, 1) && has_edit(formalEdits, 5, 18, 19),
            "rename never edits a formal or the keyword of an argument");
}

json rename_at(language::AssemblerLanguageSession& session, int id, int line, int character, const char* newName) {
    json params = cursor(line, character);
    params["newName"] = newName;
    return request(session, id, "textDocument/rename", params);
}

bool refused_with(const json& response, const char* message) {
    return response.contains("error") && response.at("error").at("code") == -32602 &&
           response.at("error").at("message") == message;
}

void test_rename_checks_the_expansion_again() {
    constexpr const char* kUnsafe = "Cannot rename safely: a macro expansion would not follow the new name";

    // The same symbol passed to two formals: both actuals are edited, and so are both references.
    language::AssemblerLanguageSession twice;
    open_document(twice,
        "PROG    START 0\n        MCDEFN\n        SOMA    P1,P2,P3\n        LDA     P1\n        ADD     P2\n"
        "        STA     P3\n        MCEND\n        SOMA    VA,VA,VB\nVA      WORD    1\nVB      RESW    1\n"
        "        END     PROG\n");
    const json twiceRename = rename_at(twice, 2, 8, 0, "VC");
    require(twiceRename.contains("result"), "rename accepts a symbol passed twice to one call");
    const json& twiceEdits = twiceRename.at("result").at("changes").at("sicxe://test/main.asm");
    require(twiceEdits.size() == 3 && has_edit(twiceEdits, 8, 0, 2) && has_edit(twiceEdits, 7, 16, 18) &&
                has_edit(twiceEdits, 7, 19, 21),
            "rename edits each actual of a symbol passed twice to one call");
    json referenceParams = cursor(8, 0);
    referenceParams["context"] = {{"includeDeclaration", true}};
    const json twiceReferences = request(twice, 3, "textDocument/references", referenceParams).at("result");
    require(twiceReferences.size() == 3 && starts_at(twiceReferences.at(1).at("range"), 7, 16) &&
                starts_at(twiceReferences.at(2).at("range"), 7, 19),
            "references list each actual of a symbol passed twice to one call");

    // A formal and a literal on one body line: the search finds the body's TOTAL and never the
    // call's, so the renamed document would still expand to TOTAL.
    language::AssemblerLanguageSession literal;
    open_document(literal,
        "PROG    START 0\n        MCDEFN\n        TAB     P\n        WORD    P,TOTAL\n        MCEND\n"
        "        TAB     TOTAL\nTOTAL   WORD    0\n        END     PROG\n");
    require(refused_with(rename_at(literal, 4, 6, 0, "SUM"), kUnsafe),
            "rename refuses edits that leave the old name in an expansion");

    // A default value: R=MAIOR is not on the call line, which names MAIOR only through P.
    language::AssemblerLanguageSession defaults;
    open_document(defaults,
        "PROG    START 0\n        MCDEFN\n        MAXIMO  P=,R=MAIOR\n        LDA     P\n        STA     R\n"
        "        MCEND\n        MAXIMO  P=MAIOR\nMAIOR   WORD    0\n        END     PROG\n");
    require(refused_with(rename_at(defaults, 5, 7, 0, "MAX"), kUnsafe),
            "rename refuses a symbol that a default value also writes");

    // A new name equal to a formal would be replaced by the actual in every expansion.
    language::AssemblerLanguageSession formal;
    open_document(formal,
        "PROG    START 0\n        MCDEFN\n        SOMA    P\n        LDA     P\n        ADD     TOTAL\n"
        "        MCEND\n        SOMA    UM\nTOTAL   WORD    0\nUM      WORD    1\n        END     PROG\n");
    require(refused_with(rename_at(formal, 6, 7, 0, "P"), kUnsafe),
            "rename refuses a new name that a macro reads as its formal");
    const json renamed = rename_at(formal, 7, 7, 0, "SUM");
    require(renamed.contains("result") && renamed.at("result").at("changes").at("sicxe://test/main.asm").size() == 2,
            "a rename that keeps every expansion is accepted");

    // Without macros nothing is expanded again: even a rename onto an existing name answers as before.
    language::AssemblerLanguageSession plain;
    open_document(plain, "MAIN START 0\nLOOP RSUB\n J LOOP\n END LOOP\n");
    const json plainRename = rename_at(plain, 9, 1, 0, "MAIN");
    require(plainRename.contains("result") &&
                plainRename.at("result").at("changes").at("sicxe://test/main.asm").size() == 3,
            "a document without macros renames as before");

    // An unclosed MCDEFN swallows the rest of the document, and LDA VALOR with it.
    language::AssemblerLanguageSession unclosed;
    open_document(unclosed,
        "PROG    START 0\nVALOR   WORD    1\n        MCDEFN\n        M\n        LDA     VALOR\n        END     PROG\n");
    require(refused_with(rename_at(unclosed, 8, 1, 0, "NOVO"),
                         "Cannot rename while the macro processor reports an error"),
            "rename refuses while the macro processor reports an error");
}

void test_rename_refuses_names_in_uncalled_macros() {
    // SOMA is never called: its TOTAL is in no expansion, so neither the place search nor
    // the second expansion can see it.
    language::AssemblerLanguageSession uncalled;
    open_document(uncalled,
        "PROG    START 0\n        MCDEFN\n        SOMA    P\n        LDA     P\n        ADD     TOTAL\n"
        "        MCEND\nTOTAL   WORD    0\n        END     PROG\n");
    require(refused_with(rename_at(uncalled, 2, 6, 0, "SUM"),
                         "'TOTAL' also appears in macro SOMA, which is never called; rename it there by hand"),
            "rename refuses a symbol named in the body of a macro that is never called");

    // The same for a macro made by an expansion: FAZ is called, USA never is.
    language::AssemblerLanguageSession created;
    open_document(created,
        "PROG    START 0\n        MCDEFN\n        FAZ\n        MCDEFN\n        USA\n        LDA     TOTAL\n"
        "        MCEND\n        MCEND\n        FAZ\nTOTAL   WORD    0\n        END     PROG\n");
    require(refused_with(rename_at(created, 3, 9, 0, "SUM"),
                         "'TOTAL' also appears in macro USA, which is never called; rename it there by hand"),
            "rename refuses a symbol named in a macro created by an expansion and never called");

    // A formal of an uncalled macro named like the symbol is a parameter, not the symbol.
    language::AssemblerLanguageSession formal;
    open_document(formal,
        "PROG    START 0\n        MCDEFN\n        CARGA   V\n        LDA     V\n        MCEND\n"
        "V       WORD    1\n        LDA     V\n        END     PROG\n");
    const json renamed = rename_at(formal, 4, 5, 0, "W");
    require(renamed.contains("result"), "rename accepts a symbol named like a formal of an uncalled macro");
    const json& edits = renamed.at("result").at("changes").at("sicxe://test/main.asm");
    require(edits.size() == 2 && has_edit(edits, 5, 0, 1) && has_edit(edits, 6, 16, 17),
            "rename leaves the formal of an uncalled macro alone");
}

} // namespace

int main() {
    test_initialize_and_diagnostics();
    test_completion_and_versioned_changes();
    test_hover_definition_references_and_rename();
    test_macro_source_has_no_false_errors();
    test_error_in_expansion_lands_on_call_line();
    test_verbatim_line_after_definition_keeps_position();
    test_rename_refuses_synthetic_symbol();
    test_rename_checks_the_expansion_again();
    test_rename_refuses_names_in_uncalled_macros();
    std::cout << "Language server protocol and feature checks passed\n";
}
