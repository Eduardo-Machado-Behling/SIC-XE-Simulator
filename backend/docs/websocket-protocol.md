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
  `ProgramCleared` removes stale assembly symbols.
- `step` executes one instruction.
- `reset` resets registers and returns PC to the loaded program's entry point.
- `clear` clears memory and assembler metadata, resets non-PC registers to
  zero, and returns PC to the loaded program's start address. Memory and
  register changes are recorded as reversible events.

Commands are case-sensitive and must match one of the forms above. Unknown
commands and invalid request envelopes receive an error response rather than
leaving the frontend request unresolved.
