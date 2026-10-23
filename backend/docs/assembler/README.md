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
- [High-level assembler flow](../uml/36_assembler_high_level_flow.puml) — shows
  parsing, both passes, encoding, and the result at a glance.
- [Syntax and format resolution](../uml/37_syntax_and_format_resolution.puml) —
  shows how line syntax and instruction metadata lead to parsing and formats.
- [Parser flow](../uml/38_parser_stage_flow.puml) — concise overview of line
  cleanup, operation selection, operand parsing, and Statement creation.
- [Pass 1 flow](../uml/39_pass1_stage_flow.puml) — layout, sizing, symbols,
  and layout directives.
- [Pass 2 flow](../uml/40_pass2_stage_flow.puml) — evaluation, emission,
  listing, and relocation records.
- [Instruction encoding flow](../uml/41_instruction_encoding_flow.puml) —
  SIC/SIC-XE and format/addressing decisions.
- [Detailed two-pass assembler UML](../uml/23_assembler_two_pass.puml) —
  maps the textbook passes to the current parser, engine, and output.
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
