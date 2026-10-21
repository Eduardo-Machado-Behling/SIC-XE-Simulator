# SIC/XE language server: model, protocol, and implementation

This guide explains what a language server is, how the editor and backend
coordinate, and how the service reuses the assembler. It describes the
current WebSocket implementation, which is an LSP-shaped subset rather than
a complete Language Server Protocol implementation.

## 1. What a language server does

### Rigorous definition

A language server is a process that provides language-aware editor features
for source documents. A client sends document lifecycle notifications and
feature requests; the server maintains a view of open documents and returns
results such as diagnostics, completions, symbol locations, and edits.

This implementation transports JSON-RPC 2.0 messages over a dedicated
WebSocket endpoint. Its basic interaction can be modeled as:

    client document snapshot
      -> language service analysis
      -> diagnostics notification and/or feature response

The service analyzes source text. It does not execute the program or change
the Simulator's memory, registers, project state, or execution history.

### The same definition in plain terms

Monaco tells the backend, “This file is open, this is its current text, and
this is where the cursor is.” The backend checks that text with the assembler
and returns useful answers. When the text changes, Monaco sends a newer
snapshot and the backend replaces its older view.

This separation matters: the language server helps write a program; the
Simulator runs it. A diagnostic is not an execution event, and a completion
request does not mutate the machine.

## 2. How it relates to the two-pass assembler

The language service does not implement a second assembler or a separate
interpretation of the source grammar. It calls the same
sicxe::Assembler::assembleDetailed() entry point used by the assembler
library. That call parses the document, builds Statement records, performs
pass 1 to assign addresses and symbols, then performs pass 2 to evaluate
expressions and encode bytes.

The language server then uses the returned AssemblyResult for editor features:

| Shared data | Editor use |
| --- | --- |
| Diagnostics | Red errors and warnings in the document |
| ISA definitions and server vocabulary | Completion catalog and instruction descriptions |
| AssemblyInfo symbol definitions and references | Completion, hover, go-to-definition, references, and rename |
| AssemblyInfo instruction source map | Available to map instruction addresses back to source lines in other integration paths |

In plain terms, assembler analysis is the shared foundation: pass 1 builds the
symbol/address map, and pass 2 validates operands and encoding. The language
server presents selected results of that analysis to the editor. It does not
need to invent another symbol table or guess whether a source line is valid.

Analysis is whole-document, not incremental parsing. Opening a file or
changing its text invalidates the cached result; diagnostic publication
reanalyzes it. Further feature requests reuse that result until the document
changes again.

For the full source syntax accepted by the shared assembler, see the
[assembler syntax set](assembler/implementation.md#3-source-syntax-set) and
[grammar](assembler/grammar.ebnf).

## 3. Document and request lifecycle

### Connection and initialization

The frontend opens a WebSocket to /language. The Server creates one
AssemblerLanguageSession for that connection. The session owns a map of open
document URIs; each document stores its text, version, save state, and cached
AssemblyResult. Separate WebSocket connections do not share document state.

The client sends an initialize request. The server responds with capabilities
for full document synchronization, completion, hover, definition, references,
and rename, plus the instruction/directive/register vocabulary. The client
then sends the initialized notification and opens documents.

### Open, change, save, and close

| Message | Server behavior |
| --- | --- |
| textDocument/didOpen | Stores the URI, text, and version, analyzes the document, then publishes diagnostics. |
| textDocument/didChange | Accepts a newer version containing the full text, replaces the snapshot, marks it unsaved and unanalyzed, then publishes fresh diagnostics. Older or equal versions are ignored. |
| textDocument/didSave | Marks the document saved and publishes diagnostics. The client normally omits text; the server accepts optional text if provided. The saved state allows the “Missing END directive” warning to appear. |
| textDocument/didClose | Removes the document and publishes an empty diagnostics list to clear editor markers. |

The service advertises full synchronization: a change carries the whole
document, not a range edit. The frontend debounces edits for 250 ms before
sending them. Documents larger than 1 MiB are rejected on open and change.

The assembler emits “Missing END directive” for an incomplete source file.
To avoid showing that warning while the user is still typing, the server
suppresses that specific warning until didSave. Other diagnostics are
published for open, changed, and saved documents.

### Feature requests

Each feature request includes a document URI and a zero-based line/character
position. The URI must refer to a document that is open in the same WebSocket
session.

| Request | Result in this implementation |
| --- | --- |
| textDocument/completion | Context-sensitive instruction/directive, selector, register, index-register, and defined-symbol suggestions. |
| textDocument/hover | Description for recognized instructions, directives, registers, and resolved symbols. |
| textDocument/definition | Location of a symbol definition in the current document. |
| textDocument/references | The symbol definition and expression references in the current document; the declaration is included when requested by the client. |
| textDocument/rename | Text edits for a user-defined symbol and its references in the current document. Invalid identifiers and reserved instruction/directive/register names are rejected. |

Definition, references, and rename are document-local. There is no workspace
index, cross-file symbol resolution, external symbol table, or linker.

## 4. Protocol boundary and errors

The service uses JSON-RPC 2.0 envelopes over WebSocket messages. Requests have
an id and receive a result or error with that id. Notifications have no id and
do not receive a JSON-RPC response; diagnostics are sent back as the
textDocument/publishDiagnostics notification.

The Server's /language WebSocket handler parses each incoming message and
passes valid JSON to AssemblerLanguageSession::handle(). Malformed JSON
receives a JSON-RPC parse error before session dispatch. The session reports
invalid requests, invalid parameters, and unknown methods using JSON-RPC error
responses when the incoming message is a request. Notifications cannot receive
a request response.

This endpoint implements the methods listed above, not every LSP feature or
transport convention. For example, it uses WebSocket messages rather than
the standard language-server stdio framing and does not advertise semantic
tokens. Monaco syntax coloring is handled by the frontend's SIC/XE Monarch
tokenizer; it is separate from server diagnostics and completion.

## 5. Frontend integration

The Monaco model uses language id sicxe and a stable sicxe://project/... URI.
On mount, CodeEditor registers for diagnostics and opens the source document.
Content changes are sent through AssemblerLanguageClient; diagnostic versions
older than the current editor version are discarded before markers are
updated.

Completion, hover, definition, references, and rename providers send JSON-RPC
requests to the same client. Initialization supplies an authoritative
instruction/directive/register catalog for the tokenizer and editor features;
a frontend fallback catalog keeps syntax coloring available before the
handshake completes.

The end-to-end connection and request flow is shown in the
[language server sequence diagram](uml/22_language_server_sequence.puml).

Set NEXT_PUBLIC_SIMULATOR_URL to the backend origin when it is not
http://localhost:8080. The frontend uses ws:// for an HTTP origin and wss://
for HTTPS.

## 6. Code layout

| Responsibility | Implementation |
| --- | --- |
| WebSocket endpoint and per-connection session creation | src/Server.cpp, Server::setup_language_ws() |
| Document state and JSON-RPC dispatch | include/language/LanguageServer.hpp and src/language/LanguageServer.cpp |
| Source parsing, two-pass analysis, and metadata | lib/sic-xe/src/Assembler/ and lib/sic-xe/include/assembler/ |
| Monaco connection and document synchronization | frontend/src/lib/language/LanguageClient.ts |
| Monaco language providers and tokenizer | frontend/src/lib/language/sicxeLanguage.ts |
| Editor lifecycle and diagnostic markers | frontend/src/components/CodeEditor.tsx |

sicxe_assembler is a position-independent static library linked into both
the architecture DLL and API executable. The API's sicxe_language_server
target contains the per-connection JSON-RPC session. Reusing the library
keeps language diagnostics and assembly validation aligned without loading or
mutating a Simulator instance.
