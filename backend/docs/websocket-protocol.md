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
1-based `source_line` that produced the instruction at `address`. The
architecture obtains this location from the assembler's instruction source
map and adds it to the existing event; clients do not need a separate source
mapping request. The field is omitted when no source mapping exists, such as
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
  `ProgramCleared` removes stale assembly symbols.
- `step` executes one instruction.
- `reset` resets registers and returns PC to the loaded program's entry point.
- `clear` clears memory and assembler metadata, resets non-PC registers to
  zero, and returns PC to the loaded program's start address. Memory and
  register changes are recorded as reversible events.

Commands are case-sensitive and must match one of the forms above. Unknown
commands and invalid request envelopes receive an error response rather than
leaving the frontend request unresolved.
