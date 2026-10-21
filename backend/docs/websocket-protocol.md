# WebSocket simulator protocol

The legacy simulator WebSocket is served at `/ws`. Each request has this
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

`load $project-id` returns the loaded project and architecture in `result`.
`load %file-path`, `reset`, and `clear` return an event batch. `step` returns
the events directly as an array.

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

- `load $project-id` loads a project and establishes a fresh architecture,
  memory, register, and assembler baseline.
- `load %file-path` clears the current program state before loading the file.
  The emitted `MemoryCleared` event resets the frontend memory view;
  `ProgramCleared` removes the stale assembly report. A source file that
  assembles is then reported by a `ProgramAssembled` event (below); a hex dump
  (a file starting with `;`) is not.
- `step` executes one instruction.
- `reset` resets registers and returns PC to the loaded program's entry point.
- `clear` clears memory and assembler metadata, resets non-PC registers to
  zero, and returns PC to the loaded program's start address. Memory and
  register changes are recorded as reversible events.

Commands are case-sensitive and must match one of the forms above. Unknown
commands and invalid request envelopes receive an error response rather than
leaving the frontend request unresolved.

## Assembly report

When `load %file-path` assembles a source file, the batch ends with one
`ProgramAssembled` event. Its `details` describe the assembly for the editor's
Assembler tab:

```json
{
  "type": "ProgramAssembled",
  "details": {
    "symbols": [{ "name": "FIRST", "value": 0 }],
    "program": { "name": "COPY", "start": 0, "length": 4215, "entry": 0 },
    "listing": [
      { "line": 2, "address": 0, "bytes": [23, 32, 45], "source": "FIRST    STL     RETADR" },
      { "line": 4, "address": null, "bytes": [], "source": "         BASE    LENGTH" }
    ],
    "relocations": [{ "address": 7, "halfBytes": 5 }],
    "diagnostics": [
      { "severity": "warning", "line": 1, "column": 0, "message": "Missing END directive" }
    ]
  }
}
```

- `symbols` is the symbol table, ordered by name.
- `program` holds the `START` label and address, the length from the start to
  the highest address reached, and the entry point (the `END` operand, else the
  start).
- `listing` has one entry per statement (blank and comment lines are left out):
  its 1-based source line, its pass-1 location (`null` for `END`, `BASE`,
  `NOBASE`, and statements after `END`), its complete object code as bytes, and
  the source line as written.
- `relocations` are the modification records: the absolute address of the
  field's first half-byte and its length in half-bytes. An object program's M
  record writes the address relative to `program.start`.
- `diagnostics` are the assembler's warnings. A source with errors does not
  assemble: the load fails with an error reply whose `events` carry the
  `MemoryCleared` and `ProgramCleared` of the load, and no `ProgramAssembled`.

Addresses and values are numbers. The frontend also accepts a `details` object
with only `symbols`, the payload of earlier backends.
