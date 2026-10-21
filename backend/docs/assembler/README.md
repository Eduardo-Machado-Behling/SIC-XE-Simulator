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

## Implementation sources

- `lib/sic-xe/src/Assembler/parser.cpp`
- `lib/sic-xe/src/Assembler/expression.cpp`
- `lib/sic-xe/src/Assembler/assembler.cpp`
- `lib/sic-xe/src/Assembler/isa.cpp`
- Public API: `lib/sic-xe/include/assembler/`

The implementation remains authoritative if these documents and the code ever
disagree.
