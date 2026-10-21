# Implemented instruction set

The assembler's instruction definitions are centralized in
`lib/sic-xe/src/Assembler/isa.cpp`. The table there provides each instruction's
opcode, format, operand schema, and whether SIC mode supports it. Mnemonics and
register names are case-insensitive.

## Operand schemas

| Schema | Source form | Constraints |
| --- | --- | --- |
| None | `FIX`, `RSUB` | No operands. `RSUB` is format 3; other no-operand instructions here are format 1. |
| Memory | `LDA expr`, `LDA #expr`, `LDA @expr`, `LDA expr,X` | A single expression, optionally immediate (`#`) or indirect (`@`). Indexing is allowed only with simple addressing and register `X`. |
| Reg | `CLEAR r`, `TIXR r` | Exactly one recognized register. |
| RegReg | `ADDR r1,r2` | Exactly two recognized registers. |
| RegCount | `SHIFTL r,n`, `SHIFTR r,n` | Register and absolute count from 1 through 16. |
| Number | `SVC n` | Absolute service number from 0 through 15. |

Format-3 memory instructions may be extended to format 4 by prefixing `+`, for
example `+JSUB TARGET`. Format 1/2 instructions and `RSUB` do not support `+`.

## Mnemonics

### Format 1

`FIX`, `FLOAT`, `HALT`, `HIO`, `NORM`, `SIO`, `TIO`

### Format 2

- One register: `CLEAR`, `TIXR`
- Two registers: `ADDR`, `COMPR`, `DIVR`, `MULR`, `RMO`, `SUBR`
- Register and shift count: `SHIFTL`, `SHIFTR`
- Service number: `SVC`

### Format 3, with supported format-4 extension where applicable

`ADD`, `ADDF`, `AND`, `COMP`, `COMPF`, `DIV`, `DIVF`, `J`, `JEQ`, `JGT`,
`JLT`, `JSUB`, `LDA`, `LDB`, `LDCH`, `LDF`, `LDL`, `LDS`, `LDT`, `LDX`,
`LPS`, `MUL`, `MULF`, `OR`, `RD`, `RSUB`, `SSK`, `STA`, `STB`, `STCH`, `STF`,
`STI`, `STL`, `STS`, `STSW`, `STT`, `STX`, `SUB`, `SUBF`, `TD`, `TIX`, `WD`

`RSUB` takes no operands and cannot use format 4. The other format-3 entries
use the memory schema and can use format 4.

## SIC mode

SIC mode is selected explicitly with `AssemblerOptions::mode = ArchMode::Sic`;
it is not inferred from the source. The following format-3 instructions are
marked SIC-compatible in the definition table:

`ADD`, `AND`, `COMP`, `DIV`, `J`, `JEQ`, `JGT`, `JLT`, `JSUB`, `LDA`, `LDCH`,
`LDL`, `LDX`, `MUL`, `OR`, `RD`, `RSUB`, `STA`, `STCH`, `STL`, `STSW`, `STX`,
`SUB`, `TD`, `TIX`, `WD`

SIC mode rejects all other instructions, format 4, and immediate or indirect
addressing. Memory instructions encode a 15-bit address and optional indexed
bit; indexing is only with `X`.

## Registers

The accepted register names and their format-2 numbers are:

| Register | Number |
| --- | ---: |
| `A` | 0 |
| `X` | 1 |
| `L` | 2 |
| `B` | 3 |
| `S` | 4 |
| `T` | 5 |
| `F` | 6 |
| `PC` | 8 |
| `SW` | 9 |

Register names are reserved and cannot be used as labels.
