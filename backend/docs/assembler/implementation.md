# Assembler implementation and behavior

This describes the public behavior of the current handwritten assembler in
`lib/sic-xe/src/Assembler/`. The implementation has a line parser, an expression
parser/evaluator, and a two-pass assembly engine.

## 1. Parsing source lines

The parser splits the source into lines and builds `Statement` records. It does
not use fixed SIC columns. Leading whitespace is allowed. The first
whitespace-delimited field is treated as an instruction or directive when it
matches a known name (a leading `+` is allowed); otherwise it is treated as a
label and the next field is the operation. A single unrecognized field becomes
a label-only statement. This means an unknown operation after a label is
reported as an unknown mnemonic, while a lone unknown token is a label.

Labels must match `[A-Za-z_][A-Za-z0-9_]*`; register names are reserved. Names
for instructions, directives, registers, and symbols are handled
case-insensitively. A period starts a full-line comment only when it is the
first character of the line. A semicolon starts an end-of-line comment outside
a single-quoted literal. Commas outside literals divide operands. Literal
apostrophes do not have an escape syntax.

Operand count and register/expression parsing follow the instruction schema.
For a memory operand the parser accepts an optional `#` or `@` prefix and an
optional second field `$X`; the assembler later rejects `$X` with immediate or
indirect mode. Register operands require the `$` prefix. In `ADD`, `SUB`,
`MUL`, `DIV`, and `COMP`, a register as the first operand selects the matching
format-2 register opcode (`ADDR`, `SUBR`, `MULR`, `DIVR`, or `COMPR`).
`TIX $r` selects the `TIXR` opcode. The explicit suffixed spellings remain
accepted as aliases.

A format-3 memory instruction can optionally specify its relative mode on the
operation token, before the whitespace-separated operand: `LDA,p TARGET`
forces PC-relative encoding and `LDA,b TARGET` forces base-relative encoding.
Without a selector, the assembler keeps its automatic mode selection. The
selector is case-insensitive. Forced PC-relative targets must have a
displacement in -2048..2047; forced base-relative targets require an active
`BASE` and a displacement in 0..4095. The assembler reports an error when the
requested mode cannot encode the target instead of selecting another mode.
These selectors are not valid for SIC mode, format 4, format-2 register forms,
or absolute immediate constants such as `LDA,p #5`.

## 2. Expressions and relocation degree

Expressions support decimal integers, `0x` hexadecimal integers, symbols, the
current location counter `*`, parentheses, unary `+`/`-`, and binary `+`, `-`,
`*`, `/`. Precedence, from highest to lowest, is unary operators, multiplication
and division, then addition and subtraction. Operators of the same precedence
associate left to right.

Each evaluated expression carries a relocation degree: constants have degree
0; labels and `*` have degree 1. Addition adds degrees and subtraction
subtracts them. Multiplication and division require absolute operands. An
expression is accepted only when its final degree is 0 or 1. The assembler
does not resolve arbitrary external symbols or link separate object modules.

Pass 1 fields that affect layout or symbol definitions require symbols to be
known at that point. Pass 2 instruction/data expressions may refer to symbols
defined later in the source.

## 3. Directives

| Directive | Implemented behavior |
| --- | --- |
| `START expr` | Must precede statements that mark code as seen. Sets the start/location address and program name from its label. The address must be absolute and within the configured address space. |
| `END [expr]` | Stops assembly of following statements. An expression selects the entry point; without one, the default entry point is the start address. Forward references in the expression can resolve in pass 2. |
| `BYTE item,...` | Emits one byte per numeric expression or the bytes from each `C'...'` / `X'...'` literal. Numeric values must be in -128..255. `X` literals require a non-empty, even number of valid hex digits. |
| `WORD expr,...` | Emits each value as three big-endian bytes. Values must fit the implemented 24-bit range, -2^23 through 2^24-1. Relocatable values add 6-half-byte relocation entries. Literals are not accepted. |
| `RESB expr` | Reserves an absolute number of bytes; emits no bytes. |
| `RESW expr` | Reserves an absolute number of three-byte words; emits no bytes. |
| `BASE expr` | Sets the base value used by subsequent format-3 XE encoding. |
| `NOBASE` | Clears the active base value. |
| `label EQU expr` | Defines the label to the evaluated value. The expression must resolve during pass 1. |
| `ORG [expr]` | Changes the location counter to the expression value, or restores the one saved prior location when omitted. Only one restore location is saved; this is not a nested stack. |

`END` is the point after which source statements are ignored, with one warning
for statements following it. If no `END` is present, assembly emits a warning
and uses the start address as the entry point. `START` and `ORG` affect the
location counter; reservations and emitted statements contribute to the
computed high-water length. An `ORG` can make the output sparse.

## 4. Two-pass assembly

### Pass 1: layout and symbols

The assembler parses all lines, then walks statements to assign addresses and
sizes, process layout directives, and define symbols. It detects duplicate
symbols, invalid layout values, SIC-mode restrictions, and address-space
overflow. Instruction sizes are fixed by format: one byte for format 1, two for
format 2, three for format 3, and four for extended format 4. In SIC mode,
memory instructions occupy three bytes.

### Pass 2: values and output bytes

The second walk evaluates forward references and emits instruction and data
bytes into `CodeMemory` at absolute addresses. Reserved space is not filled
with zero bytes. If two emitted regions overlap, an error is reported. The
text listing includes each statement's address, up to six object bytes, and
source text; the structured listing (`AssemblyInfo::lines`, below) keeps every
object byte.

### XE memory instruction encoding

For format 3, an absolute immediate constant must fit in 12 bits and is encoded
directly. Other targets are encoded in this order unless the source forces a
relative mode: PC-relative when the displacement from the following
instruction is -2048..2047; base-relative when `BASE` is active and the
displacement is 0..4095; otherwise direct addressing when the target is
0..4095. Direct encoding of a relocatable target reports a warning because
the assembler cannot relocate that direct field. If no format-3 form fits,
assembly reports an error and suggests using `+` for format 4.

Format 4 stores a 20-bit target and emits a relocation entry with five
half-bytes when the expression is relocatable. Its target must be in
0..0xFFFFF. Indexed format-3/4 operands set the `x` bit.

SIC memory instructions encode a 15-bit address plus the optional indexed bit.
SIC mode does not use XE `n/i`, `b/p/e` fields.

## 5. Output API and diagnostics

`Assembler::assembleDetailed(source)` returns an `AssemblyResult`, including a
`CodeMemory` image and `AssemblyInfo`. The metadata contains diagnostics,
program name, start address, assembled length, entry point, relocation entries,
symbols, the text listing, and the structured listing. The detailed result can
contain partial output when errors occur; inspect `AssemblyResult::ok()` before
loading it.

`AssemblyInfo::lines` is the listing as data, one `ListingLine` per statement
in the columns of Beck's Fig. 2.6: the 1-based source `line`, the pass-1
`address` (empty for `END`, `BASE`, `NOBASE`, and every statement after `END`,
which takes no location), the pass-2 object `bytes` in full, and the `source`
line as written. Blank and comment-only lines are not statements and are not
listed. Relocation entries hold the absolute address of the field's first
half-byte and its length in half-bytes. The simulator sends all of this to the
editor in the `ProgramAssembled` event (see
[`../websocket-protocol.md`](../websocket-protocol.md)).

`Assembler::assemble(source)` returns the memory image when there are no
errors. Otherwise it throws `AssemblyError`, which retains the diagnostics.
Warnings do not make `AssemblyResult::ok()` false. Diagnostics are returned in
line order, with source line and column information when available.

The default address-space limits are 1 MiB for SIC/XE and 32 KiB for SIC.
`AssemblerOptions::memoryLimit` overrides the default when nonzero.

The assembler produces a sparse in-memory image plus relocation metadata. It
does not write object-program records or apply relocations/linking. Loader and
CPU behavior are separate concerns; for compatibility details see
[`../assembler-cpu-compatibility.md`](../assembler-cpu-compatibility.md).
