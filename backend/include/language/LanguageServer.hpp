#pragma once

#include <map>
#include <string>
#include <vector>

#include "assembler/assembler.hpp"
#include "assembler/macro_processor.hpp"
#include "pch/JSON.hpp"

namespace language {

// A single WebSocket owns one session. Documents and their versions never
// escape that connection, and analysis does not touch Simulator state.
class AssemblerLanguageSession {
public:
    std::vector<nlohmann::json> handle(const nlohmann::json& message);

private:
    struct Document {
        std::string uri;
        std::string text;
        int version = 0;
        bool saved = false;
        bool analyzed = false;
        // The text is expanded first; `analysis` is of `macros.text` (MASMAPRG.ASM), so
        // its positions are mapped back to `text` before they are shown. It is empty when a
        // limit stopped the processing (`macros.stopped`): a partial text is not assembled.
        sicxe::MacroResult macros;
        sicxe::AssemblyResult analysis;
    };

    nlohmann::json request_result(const nlohmann::json& id, nlohmann::json result) const;
    nlohmann::json request_error(const nlohmann::json& id, int code, std::string message) const;
    nlohmann::json publish_diagnostics(Document& document);
    void analyze(Document& document);

    nlohmann::json completion(Document& document, const nlohmann::json& params);
    nlohmann::json hover(Document& document, const nlohmann::json& params);
    nlohmann::json definition(Document& document, const nlohmann::json& params);
    nlohmann::json references(Document& document, const nlohmann::json& params);
    nlohmann::json rename(Document& document, const nlohmann::json& params);

    std::map<std::string, Document> m_documents;
    bool m_shutdown = false;
};

} // namespace language
