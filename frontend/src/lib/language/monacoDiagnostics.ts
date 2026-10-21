import type { Monaco } from "@monaco-editor/react";
import type { LanguageDiagnostic } from "@/lib/language/LanguageClient";

export function toMonacoMarker(monaco: Monaco, diagnostic: LanguageDiagnostic) {
    return {
        startLineNumber: diagnostic.range.start.line + 1,
        startColumn: diagnostic.range.start.character + 1,
        endLineNumber: diagnostic.range.end.line + 1,
        endColumn: diagnostic.range.end.character + 1,
        severity: diagnostic.severity === 1
            ? monaco.MarkerSeverity.Error
            : diagnostic.severity === 3
                ? monaco.MarkerSeverity.Info
                : monaco.MarkerSeverity.Warning,
        source: diagnostic.source ?? "SIC/XE assembler",
        message: diagnostic.message,
    };
}
