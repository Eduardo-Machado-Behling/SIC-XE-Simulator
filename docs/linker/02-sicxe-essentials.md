# 2. SIC/XE essentials

Only the parts of SIC/XE that matter for linking. The full instruction set is in
[backend/docs/assembler/instruction-set.md](../../backend/docs/assembler/instruction-set.md).

## Memory and registers

- Memory is an array of bytes, addressed from 0. SIC/XE has 1 MB, so an address needs 20
  bits (5 hex digits).
- A **word** is 3 bytes (24 bits). Addresses in the object program are written with 6 hex
  digits.
- The registers that appear in this guide: `A` (accumulator), `X` (index), `L` (linkage:
  `JSUB` saves the return address there and `RSUB` jumps back to it), `B` (base), `PC`.

Register names are reserved: a label cannot be called `A`, `X`, `L`, `B`, `S`, `T` or `F`.
Use `PARCA`, not `A`. In this assembler a register operand is written with a `$`, as in
`CLEAR $X` or `LDA TABLE,$X`.

## Instruction formats

| Format | Size | Layout | Example |
|---|---|---|---|
| 1 | 1 byte | opcode | `FIX` |
| 2 | 2 bytes | opcode, r1, r2 | `CLEAR $X` |
| 3 | 3 bytes | opcode (6 bits), `n i x b p e`, **displacement** (12 bits) | `LDA N` |
| 4 | 4 bytes | opcode (6 bits), `n i x b p e`, **address** (20 bits) | `+LDA N` |

The `+` in front of a mnemonic asks for format 4. The six flag bits decide how the CPU turns
the last field into the **target address** (TA):

| Flags | Name | Target address | Field range |
|---|---|---|---|
| `e = 1` | format 4 | the 20-bit address itself | 0 to FFFFF |
| `p = 1` | PC-relative | `PC + disp` (PC already points past the instruction) | −2048 to 2047 |
| `b = 1` | base-relative | `B + disp` | 0 to 4095 |
| `b = p = 0` | direct (format 3) | `disp` itself | 0 to 4095 |

`n` and `i` choose how the target is used: both 1 is simple (`LDA N` loads the word at `N`),
only `i` is immediate (`LDA #5` loads the number 5), only `n` is indirect (`LDA @PTR`). With
`n = i = 0` the instruction is a plain SIC instruction with a 15-bit direct address.

For a format-3 instruction the assembler tries PC-relative first, then base-relative (when a
`BASE` directive is in effect), then direct.

## A worked encoding

`LDA` has opcode `00`. Two ways to load the word at `VALUE`, which is at offset `0A`:

```text
000000  0310000A    +LDA VALUE     format 4:  03 = opcode 00 + n,i = 1,1
                                              1  = x,b,p,e = 0,0,0,1
                                              0000A = the address of VALUE
000004  032003      LDA VALUE     format 3:  03 = opcode 00 + n,i = 1,1
                                              2  = x,b,p,e = 0,0,1,0 (PC-relative)
                                              003 = VALUE - PC = 0A - 07
```

The first instruction holds the **address** of `VALUE`. The second holds the **distance**
from the next instruction to `VALUE`. Keep this difference in mind: it is the whole of
chapter 3.

## The directives you will meet

| Directive | Meaning |
|---|---|
| `START n` | first statement; the file's addresses count from `n` |
| `END [label]` | last statement; the label is the first instruction to run |
| `WORD expr` | one word holding the value of `expr` |
| `RESW n` / `RESB n` | reserve `n` words / bytes, with no content |
| `BYTE C'..'` / `BYTE X'..'` | bytes given as characters or hex |
| `EQU expr` | define a name for a value, without reserving memory |
| `BASE label` | tell the assembler what `B` will hold, so it can use base-relative |
| `CSECT`, `EXTDEF`, `EXTREF`, `ENTRY` | stage 4: see [chapter 4](04-control-sections.md) |

`HALT` (opcode `FC`, 1 byte) is an instruction this simulator adds so a run can stop. It is
not part of Beck's SIC/XE.

## What to remember

| Field | Holds | Example |
|---|---|---|
| format-4 address | an address | `+LDA VALUE` → `0000A` |
| format-3 PC- or base-relative displacement | a distance | `LDA VALUE` → `003` |
| format-3 direct, SIC 15-bit | an address, but only up to 4095 / 32767 | used when PC- and base-relative cannot reach |
| `WORD expr` | whatever `expr` is: an address, a distance or a number | `WORD VALUE`, `WORD 5` |
| immediate `#n` | a number | `LDA #5` |

Next: [3. Relocation](03-relocation.md).
