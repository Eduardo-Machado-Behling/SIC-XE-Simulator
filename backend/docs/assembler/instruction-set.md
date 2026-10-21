# Implemented instruction set

The assembler's instruction definitions are centralized in
`lib/sic-xe/src/Assembler/isa.cpp`. The table there provides each instruction's
opcode, format, operand schema, and whether SIC mode supports it. Mnemonics and
register names are case-insensitive.

## Operand schemas

| Schema | Source form | Constraints |
| --- | --- | --- |
| None | `FIX`, `RSUB` | No operands. `RSUB` is format 3; other no-operand instructions here are format 1. |
| Memory | `LDA expr`, `LDA #expr`, `LDA @expr`, `LDA expr,$X` | A single expression, optionally immediate (`#`) or indirect (`@`). Indexing is allowed only with simple addressing and `$X`. |
| Reg | `CLEAR $r`, `TIX $r` | Exactly one recognized register. The `TIXR $r` spelling is also accepted. |
| RegReg | `ADD $r1,$r2`, `COMP $r1,$r2` | Exactly two recognized registers. Equivalent suffixed format-2 spellings are also accepted. |
| RegCount | `SHIFTL $r,n`, `SHIFTR $r,n` | Register and absolute count from 1 through 16. |
| Number | `SVC n` | Absolute service number from 0 through 15. |

Format-3 memory instructions may be extended to format 4 by prefixing `+`, for
example `+JSUB TARGET`. Format-3 memory instructions can force their relative
addressing mode with a suffix on the mnemonic: `LDA,p TARGET` forces
PC-relative encoding; `LDA,b TARGET` forces base-relative encoding and
requires an active `BASE`. The suffix is optional; without it, the assembler
selects an encoding automatically. A forced displacement outside that mode's range is
an error. The selectors cannot be combined with format 4, SIC mode, register
forms, or absolute immediate constants. Format 1/2 instructions and `RSUB` do
not support `+`.

## Mnemonics

### Format 1

`FIX`, `FLOAT`, `HALT`, `HIO`, `NORM`, `SIO`, `TIO`

### Format 2 source forms

- One register: `CLEAR $r`, `TIX $r`
- Two registers: `ADD $r1,$r2`, `COMP $r1,$r2`, `DIV $r1,$r2`, `MUL $r1,$r2`, `SUB $r1,$r2`, `RMO $r1,$r2`
- Register and shift count: `SHIFTL $r,n`, `SHIFTR $r,n`
- Service number: `SVC`

The assembler selects the format-2 register opcode when `ADD`, `SUB`, `MUL`,
`DIV`, or `COMP` begins with a register operand. For example, `ADD $A, $S`
emits the `ADDR` opcode. `TIX $X` emits the `TIXR` opcode. The older suffixed
spellings (`ADDR`, `SUBR`, `MULR`, `DIVR`, `COMPR`, and `TIXR`) remain accepted
for compatibility, but every register operand must use `$`.

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
bit; indexing is written with `,$X`.

## Registers

Register operands use a mandatory `$` prefix. The accepted names and their
format-2 numbers are:

| Register | Number |
| --- | ---: |
| `$A` | 0 |
| `$X` | 1 |
| `$L` | 2 |
| `$B` | 3 |
| `$S` | 4 |
| `$T` | 5 |
| `$F` | 6 |
| `$PC` | 8 |
| `$SW` | 9 |

Register names are reserved and cannot be used as labels.
