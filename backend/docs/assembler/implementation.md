# Assembler: model, passes, and implementation

This guide starts with the general assembler model, then follows one source
program through this implementation. It describes the handwritten assembler
in lib/sic-xe/src/Assembler/; the code and ISA table remain authoritative.

## 1. What an assembler does

### Rigorous definition

An assembler translates a program written with symbolic machine instructions
into machine-code bytes. It assigns addresses to instructions and data, maps
labels to addresses or values, and encodes operations and operands according
to an instruction set. A relocatable assembler also identifies fields whose
values need adjustment if the program is loaded at a different address.

For this project, assembly can be modeled as:

    assemble(source, mode, memoryLimit)
        -> (memory image, assembly metadata, diagnostics)

The memory image is a sparse mapping from absolute address to byte. Metadata
describes program layout, symbols, source locations, and relocation entries.
Diagnostics report errors and warnings. The assembler does not execute output.

### The same definition in plain terms

Assembly source contains names such as LOOP and instructions such as LDA. The
processor needs numeric addresses and encoded bytes instead. The assembler
answers two connected questions:

1. **Where does each statement go?** Assign addresses and learn what labels
   mean.
2. **What bytes belong there?** Encode each statement using those addresses.

The questions depend on each other. An instruction can refer to a label that
appears later, but the assembler cannot encode that reference until it knows
the label's address. This dependency is why the implementation uses two
passes.

## 2. The two-pass structure

### Pass 1: layout and symbol definition

**Theory.** The first pass walks statements in source order with a location
counter (LOC). It records each statement's address, determines its size,
processes directives that change layout, and defines labels. At the end of
this pass, later statements' addresses and the symbol table are available to
the encoder.

**In plain terms.** Pass 1 makes the map. It knows that an instruction takes
three bytes before it knows which address those bytes will refer to. It can
therefore place every instruction and learn where every label is, including a
label used before its definition in the source.

**Here.** Engine::pass1() visits parsed Statement records. It tracks lc_,
highWater_, startAddr_, and symbols_. Instruction sizes come from the
instruction definition and the selected mode/format. START, RESB, RESW, EQU,
and ORG affect layout or the symbol table. BASE and NOBASE are applied in
pass 2 because they affect encoding state, not statement addresses. EQU and
layout expressions such as ORG must resolve using symbols already defined at
that point.

### Pass 2: expression resolution and encoding

**Theory.** The second pass uses the completed symbol table to evaluate
operands, encode instruction and data bytes, and record relocation information
for values that depend on the program's load address.

**In plain terms.** Pass 2 fills the map. When LDA VALUE is reached, VALUE
already has an address, even if its definition appeared later in the source.

**Here.** Engine::pass2() walks the statements again. pass2Instruction()
encodes instructions; pass2Directive() emits BYTE and WORD data and updates
BASE, NOBASE, and END state. emit() writes bytes into CodeMemory and reports
overlapping output. Reserved regions advance the location counter but do not
create bytes.

The pipeline is:

    source text
      -> parse lines into Statement records
      -> pass 1: addresses, sizes, and symbols
      -> pass 2: encoded bytes and relocation entries
      -> AssemblyResult: sparse memory image + metadata + diagnostics

The parser builds a shared intermediate representation before either pass. It
recognizes syntax and records operands, but it does not assign final
addresses, resolve symbols, or emit object bytes. The mapping from the
textbook model to the current classes and methods is shown in the
[two-pass assembler diagram](../uml/21_assembler_two_pass.puml).

## 3. Source syntax set

This section defines the syntax accepted by the implementation. Operand
meaning and counts are further constrained by the instruction schema in
[instruction-set.md](instruction-set.md). The fuller EBNF is in
[grammar.ebnf](grammar.ebnf).

### Lines, labels, and operations

    line       := blank | comment | [label whitespace] operation [operands] [comment]
    label      := identifier
    operation  := ["+"] mnemonic [",p" | ",b"] | directive
    operands   := operand {"," operand}
    identifier := letter-or-underscore {letter | digit | underscore}

This is whitespace-separated free-format source; classic fixed SIC columns
are not required. The first field is treated as an operation when it names a
known instruction or directive (with optional + for format 4). Otherwise it
is treated as a label and the next field is the operation. A single
unrecognized field is a label-only line. Thus an unknown operation after a
label is diagnosed as an unknown mnemonic, while one token alone is a label.

Names are case-insensitive. Labels follow
[A-Za-z_][A-Za-z0-9_]*; register names cannot be labels. A period is a
full-line comment only when it is the first character of the line. A
semicolon starts an end-of-line comment outside a quoted literal. Commas
split operands only outside literals. Literal apostrophes have no escape
syntax.

### Instructions and operand forms

The accepted instruction names and formats come from isa.cpp and are listed
in [instruction-set.md](instruction-set.md). The operand forms are:

    memory operand      := ["#" | "@"] expression ["," "$X"]
    register            := "$" register-name
    register pair       := register "," register
    register and count  := register "," expression
    service number      := expression

# selects immediate addressing and @ selects indirect addressing. The
optional second memory operand is the index register and must be $\$X$; indexed
immediate and indexed indirect operands are rejected. Register operands must
include \$, for example ADDR \$A, \$S.

For ADD, SUB, MUL, DIV, and COMP, a register as the first operand selects the
corresponding format-2 register operation (ADDR, SUBR, MULR, DIVR, or COMPR).
TIX $r selects TIXR. Explicit suffixed mnemonics remain valid.

The optional ,p or ,b selector belongs to the operation token, before its
operand: LDA,p TARGET or LDA,b TARGET. It forces PC-relative or base-relative
format-3 encoding. Without it, the assembler chooses a suitable mode
automatically. Selectors are only valid for format-3 memory instructions;
they are rejected for SIC mode, format 4, non-memory instructions, and
absolute immediate constants such as LDA,p #5.

### Directives and data literals

    START expr       END [expr]       BASE expr       NOBASE
    BYTE item,...   WORD expr,...    RESB expr      RESW expr
    label EQU expr  ORG [expr]

    item := expression | C'characters' | X'hex-digits'

BYTE accepts numeric expressions and character/hex literals. WORD accepts
numeric expressions only. C literals emit the source string bytes; X literals
require at least one complete pair of hexadecimal digits. Literal quotes
cannot be escaped.

### Expression syntax

    expression := sum
    sum        := product {("+" | "-") product}
    product    := unary {("*" | "/") unary}
    unary      := ["+" | "-"] unary | primary
    primary    := decimal | "0x" hex-digits | symbol | "*" | "(" expression ")"

Unary operators bind most tightly, then multiplication/division, then
addition/subtraction. Operators of the same level associate left to right.
The * primary means the current location counter; in product position it is
the multiplication operator.

The evaluator attaches a **relocation degree** to each value. Constants have
degree 0; labels and * have degree 1. Addition adds degrees and subtraction
subtracts them. Multiplication and division require degree-0 operands. A
completed expression is accepted only when its degree is 0 (absolute) or 1
(relocatable). This is a small relocation model for one assembled program,
not a general linker or external-symbol system.

## 4. What directives do to the two passes

| Directive | Pass and effect |
| --- | --- |
| START expr | Pass 1 sets the start address and location counter. Its expression must be absolute and in range. A label on START becomes the program name and a symbol. It must appear before any instruction/directive statement that marks code as seen. |
| END [expr] | Pass 1 ends source processing; later statements are ignored with one warning. Pass 2 evaluates the optional entry expression, which may refer forward. Without an expression, entry defaults to the start address. |
| BYTE item,... | Pass 1 determines the size. Pass 2 emits one byte for each numeric expression or the literal's bytes. Numeric values must be in -128..255. |
| WORD expr,... | Pass 1 reserves three bytes per expression. Pass 2 emits each value as three big-endian bytes. Values must be -2^23 through 2^24-1. A relocatable value adds a six-half-byte relocation entry. |
| RESB expr | Pass 1 advances the location counter by an absolute byte count. Pass 2 emits no bytes for the reservation. |
| RESW expr | Pass 1 advances by three times an absolute word count. Pass 2 emits no bytes. |
| BASE expr | Pass 2 sets the base value used by following format-3 encoding. |
| NOBASE | Pass 2 clears the active base value. |
| label EQU expr | Pass 1 defines the label to the expression's value. The expression must resolve from symbols already defined. |
| ORG [expr] | Pass 1 moves the location counter to an in-range expression value, or restores the one saved prior location when omitted. Only one restore location is saved; nested ORG stacks are not supported. |

If END is absent, assembly warns and uses the start address as the entry point.
Program length is the high-water address reached minus the start address, so
ORG may make the image sparse without decreasing its reported length.
Attempting to emit into an address already written is an error.

## 5. Addressing and instruction encoding

### Format 3

An absolute immediate constant (#number) is encoded directly and must be in
0..4095. For other targets, automatic selection tries these forms in order:

1. **PC-relative:** target minus the address after this instruction must be
   -2048..2047.
2. **BASE-relative:** if BASE is active, target minus base must be 0..4095.
3. **Direct:** target must be 0..4095.

LDA,p target and LDA,b target force the corresponding relative form and
produce an error if it cannot encode the target. Direct encoding of a
relocatable target warns because the direct field cannot be adjusted at load
time. If no form fits, the assembler reports an error and suggests format 4.

### Format 4 and SIC mode

Format 4 stores a 20-bit target in 0..0xFFFFF. A relocatable target produces
a relocation entry of five half-bytes. Indexed format-3 and format-4 operands
set the x bit. Format 4 is available only for instructions whose ISA
definition allows it.

SIC memory instructions encode a 15-bit address and optional indexed bit in
three bytes. SIC mode does not use the XE n/i or b/p/e fields; it rejects
format 4, immediate/indirect addressing, and instructions unavailable in SIC.

## 6. Result, diagnostics, and limits

Assembler::assembleDetailed(source) returns an AssemblyResult: a CodeMemory
image and AssemblyInfo. The metadata contains diagnostics, program name, start
address, assembled length, entry point, relocation entries, the symbol-value
map, symbol definition locations, symbol references, the instruction source
map, and the listing. Definition and reference locations use 1-based source
lines and columns. Each instruction source-map entry pairs its absolute
address and byte size with its 1-based source line; this lets the simulator or
frontend map a fetched instruction address back to an editor line.

The detailed result may contain partial output when errors occur; check
AssemblyResult::ok() before loading it. assembleDetailed() is const and does
not update the Assembler object's saved metadata. assemble() stores the
latest metadata in lastInfo() even when it throws AssemblyError. clear()
resets that saved metadata. Warnings do not make ok() false. Diagnostics
include source line and column when available and are returned in line order.

The default address-space limit is 1 MiB for SIC/XE and 32 KiB for SIC.
AssemblerOptions::memoryLimit overrides the default when nonzero. The
assembler produces a sparse in-memory image plus relocation metadata. It does
not write object-program records or apply relocation/linking; loader and CPU
behavior are separate concerns. For compatibility between assembled bytes and
CPU decoding, see
[assembler/CPU compatibility](../assembler-cpu-compatibility.md).
