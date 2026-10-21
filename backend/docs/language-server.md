# SIC/XE assembler language service

The backend exposes an LSP-shaped JSON-RPC 2.0 protocol over the dedicated
`/language` WebSocket. Each connection owns its open documents and versions.
The language service calls the same `sicxe_assembler` library used by the
SIC/XE architecture DLL. It does not mutate simulator memory, registers, or
execution history.

## Supported methods

| Method | Behavior |
| --- | --- |
| `initialize` | Advertises full text synchronization, diagnostics, completion, hover, definition, references, rename, and the assembler vocabulary. |
| `textDocument/didOpen` | Stores a document and publishes diagnostics. |
| `textDocument/didChange` | Replaces the full document when the incoming version is newer, then publishes diagnostics. |
| `textDocument/didSave` | Publishes save-time diagnostics, including the missing `END` warning. |
| `textDocument/didClose` | Drops the document and clears its published diagnostics. |
| `textDocument/completion` | Completes instructions, optional `,p`/`,b` format-3 selectors, directives, `$`-prefixed registers, index register `$X`, and defined symbols based on the current operand position. |
| `textDocument/hover` | Describes instructions, directives, registers, and resolved symbols. |
| `textDocument/definition` | Locates a symbol declaration in the current document. |
| `textDocument/references` | Lists a symbol's declaration and expression uses in the current document. |
| `textDocument/rename` | Returns edits for a user-defined symbol and its expression uses. Reserved assembler names cannot be used as the replacement name. |

The service advertises `TextDocumentSyncKind.Full`; each `contentChanges`
entry must contain the full source text. Document versions are monotonic. A
change with an older or equal version is ignored. The open document limit is
1 MiB. Incomplete, unsaved documents do not show the expected “Missing END”
warning; it is included after `didSave`.

## Frontend connection

Monaco uses the `sicxe` language id and a tokenizer vocabulary received from
`initialize`, keeping instruction, directive, and register names in sync with
the assembler tables. Register completion inserts `$A`, `$X`, and the other
prefixed register spellings. The editor opens a stable `sicxe://project/...` URI,
sends debounced full-text changes, and drops diagnostics whose document version
is stale. Completion, hover, definition, references, and rename are backed by
the JSON-RPC methods above.

Set `NEXT_PUBLIC_SIMULATOR_URL` to the backend origin when it is not
`http://localhost:8080`. The language endpoint uses `ws://` for HTTP origins
and `wss://` for HTTPS origins.

## Build layout

`sicxe_assembler` is a position-independent static library linked into both
the architecture DLL and the API executable. This lets the language service
reuse the assembler implementation without loading or mutating a simulator
instance. The `sicxe_language_server` target contains the per-connection
JSON-RPC session and is linked into the API executable.
