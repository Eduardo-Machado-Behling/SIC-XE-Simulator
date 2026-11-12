# WebSocket simulator protocol

The simulator WebSocket is served at `/ws`. Each request has this
envelope:

```json
{
  "id": "request-id",
  "type": "command",
  "payload": "step"
}
```

The server replies with the same `id`. A successful command uses `result`:

```json
{
  "id": "request-id",
  "result": {
    "from": 3,
    "to": 7,
    "events": []
  }
}
```

`load $session-id/$project-id` loads a project from the current browser
session and returns the loaded project and architecture in `result`. Both IDs
are UUIDs. Project contents are synchronized through the session project API
before this command is sent. There is no global/default project store.
`load %file-path`, `reset`, and `clear` return an event batch. `step` returns
the events directly as an array.

For source assembled from a project file, `InstructionFetched` includes the
1-based `source_line` that produced the instruction at `address`. It is a line
of the assembled text, `MASMAPRG.ASM`, the macro processor's output: the
project file itself when it has no macros, and otherwise mapped back to the
file by `MacrosExpanded.lineMap`. The architecture obtains this location from
the assembler's instruction source map and adds it to the existing event;
clients do not need a separate source mapping request. The field is omitted when no source mapping exists, such as
when executing a raw hex image. A debugger-style editor can use this field to
place its current-instruction marker without interpreting instruction bytes.

The optional `preview: true` field marks an artificial fetch used only to
position the debugger on the next instruction. It is emitted after a
non-halting step and after `reset` or `load`. A preview does not execute the
instruction; clients should use it to move the current-instruction marker, not
to animate an instruction as consumed. A normal fetch has no `preview` field.

Example fetched instruction:

```json
{
  "type": "InstructionFetched",
  "address": 4096,
  "value": [0, 16, 3],
  "source_line": 7,
  "preview": true
}
```

## MacrosExpanded

`load %file-path` runs the macro processor before the assembler, and reports
its result in a `MacrosExpanded` event (see the
[macro processor](macro-processor/README.md)).
- The event is emitted on every load of an assembly source, including a source
  without macros. A file that starts with `;` is a hexadecimal dump, which has
  no processor and no event.
- It is emitted before the assembler runs, after `ProgramCleared`.
- A failed load, with a processor or an assembler error, carries the event in
  `error.events`.
- It changes no simulator state.

`details` has these fields (`lib/sic-xe/src/MacroReportJson.cpp`). Every string
is valid UTF-8: an ill-formed byte sequence of the source becomes U+FFFD.

| Field | Content |
| --- | --- |
| `file` | Always `"MASMAPRG.ASM"` |
| `ok` | `true` when the processor reported no error |
| `hasMacros` | `true` when the processor read an `MCDEFN` line (a call needs one) |
| `text` | The text of MASMAPRG.ASM, which is the text assembled |
| `diagnostics[]` | `{severity, line, column, length, message}`: the processor's diagnostics, in source positions. `severity` is `"error"` or `"warning"` |
| `names[]` | `{name, definition, line}`: the name table. `name` is in upper case, `definition` indexes `definitions`, and `line` is the prototype line, `0` for a macro an expansion created |
| `definitions[]` | `{index, name, prototype, labelFormal, formals, active, origin, body}`: the definition table, inactive definitions included. See the notes below |
| `expansions[]` | `{serial, macro, definition, parent, depth, callLine, callText, actuals, output}`: one entry per call, in serial order. See the notes below |
| `lineMap[]` | `{output, source, kind, serial}`: one entry per MASMAPRG.ASM line. See the notes below |
| `trace` | `{truncated, steps}`: one step per line read. `truncated` is `true` past 5000 steps. See the notes below |

Notes on `definitions[]`:
- `labelFormal` is a string or `null`.
- `formals[]` is `{name, default}`, where `default` is a string or `null`.
- `origin` is `{kind: "source", line}`, with the `MCDEFN` line, or
  `{kind: "expansion", serial}`.
- `body[]` is `{text, line}`, with the prototype first and `MCEND` last.
  `text` is in display form: markers are `#i`, or `#(d,i)` in a definition
  that holds nested definitions. `line` is the source line, or `null`.

Notes on `expansions[]`:
- `parent` is the serial of the enclosing expansion, or `null`. `depth` is 1
  at the top level.
- `callLine` is the source line of the outermost call. `callText` is the call
  as read; a nested call shows its actuals substituted.
- `actuals[]` is `{index, formal, value}`, with index 0 for the label formal.
- `output` is `{from, to}`: the MASMAPRG.ASM lines it produced, inclusive.

Notes on `lineMap[]`:
- `kind` is one of `verbatim`, `call`, `label` or `expanded`.
- `source` is the line's own source line for `verbatim`, and otherwise the
  line of the outermost call.
- `serial` is the innermost expansion, or `null`.

Notes on `trace.steps[]`, which are `{step, read, d, e, depth, text, action,
target}`:
- `read` is `{from: "source", line}` or `{from: "expansion", serial, bodyLine}`.
- `d` is the definition level before the line. `e` is `true` while expansions
  are open, and `depth` is how many are open.
- `action` is one of `copy`, `define-start`, `prototype`, `store`,
  `define-end`, `call`, `read-prototype`, `expansion-end` or `error`.
- `target` depends on the action:
  - `{output}` for `copy`;
  - `{definition, bodyLine}` for `prototype`, `store` and `define-end`, when
    the line entered a definition;
  - `{serial}` for `call`;
  - `null` otherwise.

Example: the event from loading
[`macro_demo.asm`](../lib/sic-xe/test/data/macro_demo.asm). It is **trimmed**:
each array keeps only its first entries, the trace keeps steps 1, 3, 30 and
31, and `text` is cut after its fourth line. Every value shown is as the
backend sent it.

```json
{
  "details": {
    "definitions": [
      {"active": true, "body": [{"line": 3, "text": "L       SOMA X,Y,Z           ; Z = X + Y"}, {"line": 4, "text": "#0       LDA #1"}, {"line": 5, "text": "        ADD #2"}, {"line": 6, "text": "        STA #3"}, {"line": 7, "text": "        MCEND"}], "formals": [{"default": null, "name": "X"}, {"default": null, "name": "Y"}, {"default": null, "name": "Z"}], "index": 0, "labelFormal": "L", "name": "SOMA", "origin": {"kind": "source", "line": 2}, "prototype": "L       SOMA X,Y,Z"}
    ],
    "diagnostics": [],
    "expansions": [
      {"actuals": [{"formal": "L", "index": 0, "value": "INICIO"}, {"formal": "V", "index": 1, "value": "N"}], "callLine": 30, "callText": "INICIO  DOBRA N              ; N = 10", "definition": 1, "depth": 1, "macro": "DOBRA", "output": {"from": 3, "to": 7}, "parent": null, "serial": 1},
      {"actuals": [{"formal": "L", "index": 0, "value": "INICIO"}, {"formal": "X", "index": 1, "value": "N"}, {"formal": "Y", "index": 2, "value": "N"}, {"formal": "Z", "index": 3, "value": "N"}], "callLine": 30, "callText": "INICIO       SOMA N,N,N", "definition": 0, "depth": 2, "macro": "SOMA", "output": {"from": 4, "to": 7}, "parent": 1, "serial": 2}
    ],
    "file": "MASMAPRG.ASM",
    "hasMacros": true,
    "lineMap": [
      {"kind": "verbatim", "output": 1, "serial": null, "source": 1},
      {"kind": "verbatim", "output": 2, "serial": null, "source": 29},
      {"kind": "call", "output": 3, "serial": 1, "source": 30},
      {"kind": "call", "output": 4, "serial": 2, "source": 30},
      {"kind": "expanded", "output": 5, "serial": 2, "source": 30}
    ],
    "names": [
      {"definition": 0, "line": 3, "name": "SOMA"}
    ],
    "ok": true,
    "text": ". Demo do processador de macros\nPROG    START 0x0000\n.INICIO  DOBRA N              ; N = 10\n.INICIO       SOMA N,N,N\n",
    "trace": {
      "steps": [
        {"action": "copy", "d": 0, "depth": 0, "e": false, "read": {"from": "source", "line": 1}, "step": 1, "target": {"output": 1}, "text": ". Demo do processador de macros"},
        {"action": "prototype", "d": 1, "depth": 0, "e": false, "read": {"from": "source", "line": 3}, "step": 3, "target": {"bodyLine": 1, "definition": 0}, "text": "L       SOMA X,Y,Z           ; Z = X + Y"},
        {"action": "call", "d": 0, "depth": 0, "e": false, "read": {"from": "source", "line": 30}, "step": 30, "target": {"serial": 1}, "text": "INICIO  DOBRA N              ; N = 10"},
        {"action": "read-prototype", "d": 0, "depth": 1, "e": true, "read": {"bodyLine": 1, "from": "expansion", "serial": 1}, "step": 31, "target": null, "text": "L       DOBRA V              ; V = 2 * V   (chamada aninhada de SOMA)"}
      ],
      "truncated": false
    }
  },
  "type": "MacrosExpanded"
}
```

A source without macros still gets the event, with `hasMacros: false`, `text`
equal to the source and an identity `lineMap`. The processor's error on a
source whose `MCDEFN` is never closed fails the load:
- `error.detail` is `"1:9: error: MCDEFN without MCEND\n"`;
- the event in `error.events` has `"ok": false` and `"text": ""`, and its one
  diagnostic is:

```json
{"column": 9, "length": 6, "line": 1, "message": "MCDEFN without MCEND", "severity": "error"}
```

## Errors

Errors use the same problem fields as the HTTP API's `Error` schema. If a
command already changed simulator state before failing, `events` contains the
events that the frontend must apply before showing the error:

```json
{
  "id": "request-id",
  "error": {
    "type": "invalid-request",
    "status": 400,
    "title": "Invalid request",
    "detail": "...",
    "events": []
  }
}
```

The frontend applies those events and shows the problem title and detail in an
error modal. Malformed JSON cannot be correlated to a request, so its response
uses a `null` id.

## Commands

- `load $session-id/$project-id` loads a session project and establishes a fresh architecture,
  memory, register, and assembler baseline.
- `load %file-path` clears the current program state before loading the file.
  The emitted `MemoryCleared` event resets the frontend memory view;
  `ProgramCleared` removes stale assembly symbols. For an assembly source,
  `MacrosExpanded` follows, before the assembler runs.
- `step` executes one instruction.
- `reset` resets registers and returns PC to the loaded program's entry point.
- `clear` clears memory and assembler metadata, resets non-PC registers to
  zero, and returns PC to the loaded program's start address. Memory and
  register changes are recorded as reversible events.

Commands are case-sensitive and must match one of the forms above. Unknown
commands and invalid request envelopes receive an error response rather than
leaving the frontend request unresolved.
