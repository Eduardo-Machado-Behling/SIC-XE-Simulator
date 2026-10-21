# SIC/XE assembler documentation

These documents describe the assembler that is implemented in this repository.
The grammar is a readable specification of the handwritten parser; it is not
input to a parser generator.

## Documents

- [Source grammar](grammar.ebnf) — line structure, operands, expressions, and
  lexical rules.
- [Instruction set](instruction-set.md) — implemented mnemonics, operand
  schemas, registers, and SIC-mode availability.
- [Assembly process and output](implementation.md) — pass behavior, symbol and
  location handling, instruction encoding, diagnostics, and result metadata.
- [Two-pass assembler UML](../uml/21_assembler_two_pass.puml) — maps the
  textbook analysis/synthesis passes to the current parser, engine, and output.
- [Language server sequence UML](../uml/22_language_server_sequence.puml) —
  shows Monaco document synchronization, diagnostics, and feature requests
  over the `/language` WebSocket.

## Implementation sources

- `lib/sic-xe/src/Assembler/parser.cpp`
- `lib/sic-xe/src/Assembler/expression.cpp`
- `lib/sic-xe/src/Assembler/assembler.cpp`
- `lib/sic-xe/src/Assembler/isa.cpp`
- Public API: `lib/sic-xe/include/assembler/`

The implementation remains authoritative if these documents and the code ever
disagree.
