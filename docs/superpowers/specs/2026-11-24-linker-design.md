# Linker checkpoint (stage 4): design

Status: awaiting approval · 2026-11-24 · builder check done

## 1. Intent

Stage 4 of the UFPel Systems Programming project adds a **two-pass linker** to the
SIC/XE simulator. The course text for the checkpoint:

> O Ligador deverá ser implementado em duas passagens. [...] Quando for exigido apenas
> um ligador, a finalização da relocação será deixada para o momento da carga
> (Carregador Relocador).

The group delivers the **"ligador only"** variant: the linker links and relocates
every control section relative to the start of the linked program, and a
**relocating loader** adds the actual load address when it puts the program in
memory.

The work is graded by a group video (10 min, +5 tolerance). The video must show
the **interaction between the components** and an explanation of how they work
and which techniques they use. It must not be only slides, and it must not be
individual presentations of the components. Every visualization below is there
so that the video can show one stage handing its output to the next.

**Top priority: follow Beck's conventions** (*System Software*, 3rd ed.,
§2.3.5 Control Sections, §3.2.3 Linking Loader Algorithm, §3.4.1 Linkage Editors)
over the course slides. In Beck's terms we build a **linkage editor** plus a
**relocating loader** (Fig. 3.13b). The one deliberate addition beyond Beck is the
`ENTRY` directive (§4.2).

Sources (git-ignored, in `resources/`, parsed copies in `resources/parsed/`):
Beck (primary), the course slides `04-Projetos de computadores 1 - Ligadores 1`
(secondary), Levine *Linkers and Loaders* (background).

## 2. Goals, non-goals, anti-goals

**Goals**

1. Several source files are assembled independently and linked into one program.
   The user picks which files take part with an include toggle per file.
2. The assembler supports Beck's control sections: `CSECT`, `EXTDEF`, `EXTREF`,
   external references in format-4 instructions and in `WORD` expressions, and a
   separate location counter and symbol scope per section.
3. The linker runs Beck's two passes. Pass 1 assigns section addresses and builds
   the ESTAB. Pass 2 resolves external references and relocates relative to the
   start of the linked program. The result is a relocatable linked program.
4. A relocating loader adds the load address (PROGADDR, from a UI field) to
   every relative field and writes the program to memory.
5. The intermediate products are visible and readable: one `.obj` per source and one
   linked `.out`, in Beck's record format with readable annotations.
6. A Linker view shows the ESTAB and a step trace of pass 1, pass 2 and the loader,
   cross-linked with the source and the generated files.
7. The debugger works across files: the current instruction is shown in the right
   file at the right line.
8. **Test-driven, with guards.** Each behavior starts as a failing test, and each
   invalid input fails loudly with a diagnostic that points to the source line.

**Non-goals** (not built now)

- Linking loader (one step that loads while linking, Beck §3.2.3): the variant
  delivered is linkage editor + relocating loader.
- Ligador-relocador (load address known at link time).
- Loading `.obj` files supplied from outside. The text is generated from the data
  and never parsed back (approach B, §3).
- Automatic library search, overlays, dynamic linking, bit-mask relocation.
- Literals and `LTORG` (Beck §2.3.1). The golden fixtures use `BYTE`s instead (§8).
- Cross-file diagnostics in the language server. Errors that need several files
  (undefined external, duplicate definition, `ENTRY` count) are reported at Run.
- Relinking a `.out`.

**Anti-goals** (failure even if it technically works)

- A three-way editor split. The editor area stays at two panes (§6.1).
- Unreadable binary output. `.obj`/`.out` must read close to instructions.
- Breaking today's single-file programs, examples or tests. One file with
  `START` keeps working unchanged.
- Silent wrong bytes. A field the linker or loader cannot fill correctly is an
  error, never a guess.

## 3. Approaches

| | Interface between stages | Trade-off |
|---|---|---|
| A | The `.obj`/`.out` **text** is the interface. Each stage parses the previous file. | Literal "components talk through files", but needs a record parser/writer. Source maps and band origins cannot travel in Beck's records, so they would need a side channel anyway. |
| **B (chosen)** | An **`ObjectProgram` value** is the interface. `.obj`/`.out` text is rendered from it by one writer. | Smallest build, nothing to parse, source maps travel with the data. The files are a view of the data, not the data itself. Beck §2.3.5 allows this: "the exact format of these records is arbitrary; however, the same information must be passed to the loader in some form." |
| C | B plus a parser and a round-trip test. | Proves the files are the real data and allows loading foreign `.obj` files, but nobody asked for that. B becomes C later by adding the parser. |

**Picked: B.** It keeps the trust in what is on screen by testing the rendered
`.obj`/`.out` text against Beck's figures (§8), not only the internal values.

## 4. Source language additions

### 4.1 Beck's control sections (unchanged from Beck)

```
COPY    START   0                   . first control section, LOCCTR from 0
        EXTDEF  BUFFER,BUFEND,LENGTH
        EXTREF  RDREC,WRREC
FIRST   STL     RETADR
CLOOP  +JSUB    RDREC               . external reference: format 4
        ...
RDREC   CSECT                       . new section: own LOCCTR (0) and own symbols
        EXTREF  BUFFER,LENGTH,BUFEND
       +STX     LENGTH
MAXLEN  WORD    BUFEND-BUFFER       . two M records (+BUFEND, -BUFFER)
        END     FIRST               . one END per file, as in Beck Fig. 2.15
```

`END` ends the **file**, not a section (Beck Fig. 2.15 has one `END FIRST` at the
end of the file). Its operand is resolved in the **first** section's scope (FIRST
is COPY's). The transfer address goes on the first section's E record, and the
other sections' E records have none (Fig. 2.17). Statements after `END` stay
ignored, as today.

So every file, subroutine files included, ends with its own `END`:

| File | How it ends | E record |
|---|---|---|
| entry file (`ENTRY`) | `END INICIO` (operand optional) | first section: transfer address |
| subroutine file, e.g. `maximo.asm` (Beck Fig. 3.8 PROGB/PROGC) | `END`, no operand | no address |
| file with several sections (`START` … `CSECT` …) | a single `END` after the last section | as above, per file kind |

A missing `END` is an error. An `END` in the middle of a file still ends it, and
what follows is ignored, as today. A `CSECT` after `END` is therefore ignored, not
started, so the assembler warns about it.

Rules, all from Beck §2.3.5:

- `CSECT` starts a new control section, named by its label, with its own location
  counter starting at 0. A file may hold several sections.
- Section names are external symbols automatically, with no `EXTDEF` needed.
- A symbol defined in one section is not visible in another unless it is
  exported (`EXTDEF`) there and imported (`EXTREF`) here. The same local name may
  be defined in different sections.
- An external reference leaves 0 in the field plus a revised Modification
  record (`M` address, length in half-bytes, `+`/`-`, symbol).
- An external symbol can only fill a field that holds an **address**: a
  format-4 address field (5 half-bytes) or a `WORD` (6 half-bytes). A format-3
  displacement holds `target − PC`, which neither the assembler nor an M record
  can produce for a symbol whose location is unknown.
- `EQU` with an external term is not allowed. The expression stays unresolved.

### 4.2 `ENTRY` (our addition)

`PROG ENTRY 0` behaves exactly like `START`: it is the first statement of the file
and opens its first section. It also marks the file as the **entry file** of the
program. The file's `END <symbol>` still sets the transfer address (Beck's End
record, §4.1).

- Across the included files, **exactly one** `ENTRY` must exist. Zero or two or more
  is an error.
- An `END` with an operand outside the entry file is an error. This replaces
  Beck's "if several sections give a transfer address, the last one wins": with
  `ENTRY` that case can only be a mistake.
- With **one included file**, `ENTRY` is optional and `START` works as today.
  Every existing program keeps running.
- The `ENTRY` section is loaded first. The linked program is named after it
  (`PROG.out`), and its transfer address becomes the program's.

Note: in IBM's 360 assembler `ENTRY` means what `EXTDEF` means here. Beck does not
use `ENTRY`, so there is no clash inside this project's reference.

**Breaking change.** The parser reads the first field as a label unless it is an
opcode or directive name (`parser.cpp`, `isOpcodeName`). Once `ENTRY`, `CSECT`,
`EXTDEF` and `EXTREF` are directives, a line that uses one of them as a label no longer
parses. Today's default `main.asm` does exactly that (`ENTRY   lda #5`), and
browsers keep stored copies of it. So a line whose first field is one of these
names, followed by an instruction mnemonic, gets a targeted error ("ENTRY is a
directive since stage 4; rename this label"), not a generic one. The new default
project renames the label (§6.5).

### 4.3 Start addresses

- In a link of **two or more files**, every `START`/`ENTRY` operand must be 0: each
  control section is relocatable (Beck §3.2). A nonzero value is an error that
  explains why.
- **One file** with `START n`, n ≠ 0, is an absolute program and loads at n, as
  today. With a nonzero load-address field this is an error ("an absolute program
  cannot be relocated; set the load address to 0").

### 4.4 SIC mode

Linking and relocation are **SIC/XE only**. A SIC instruction holds a 15-bit
direct address that no half-byte M record can patch (Beck relocates SIC with bit
masks, a non-goal), so a SIC program at any address other than its own would get
wrong bytes. In SIC mode, a link of more than one file, `CSECT`/`EXTDEF`/`EXTREF`,
or a nonzero load address is an error. A single SIC file at load address 0 works
as today. *(My call: no non-test code selects SIC mode today, and Beck's
control-section examples are SIC/XE.)*

## 5. Pipeline

```
for each included file (entry file first, then explorer order):
    macro processor  ->  MASMAPRG.ASM text for that file      (unchanged)
    assembler        ->  ObjectProgram: one or more sections   (extended)
linker   pass 1      ->  section addresses + ESTAB
         pass 2      ->  linked ObjectProgram, relative to 0, relocation M records only
loader               ->  adds PROGADDR to every relocation field, writes memory,
                         PC = PROGADDR + transfer address
```

### 5.1 Data (`ObjectProgram`, approach B)

```cpp
struct ModRecord { std::size_t address; unsigned halfBytes; char sign; std::string symbol; };
struct TextRun   { std::size_t address; std::vector<std::uint8_t> bytes; };
struct ControlSection {
    std::string name;                 // H record
    std::size_t length;
    std::vector<std::pair<std::string, std::size_t>> defines;  // D
    std::vector<std::string> refers;                           // R
    std::vector<TextRun> text;                                 // T
    std::vector<ModRecord> mods;                               // M
    std::optional<std::size_t> transfer;                       // E
    std::string sourceFile;           // origin, for bands and the source map
    std::vector<InstructionSourceLocation> sourceMap;          // section-relative
};
struct ObjectProgram { std::vector<ControlSection> sections; };
```

The field names are illustrative; the builder may adjust. What matters is that
everything Beck's records carry is present, plus the origin and the source map.

Local relocation is expressed the way Beck's revised M record does it: a field
that is relative to its own section gets `M ... +<section name>`. So the
relocations the assembler already records become M records naming their own
section.

### 5.2 Linker (Beck Fig. 3.11, writing a program instead of memory)

- **Pass 1:** CSADDR starts at 0. For each section in order, enter its name into
  the ESTAB with CSADDR and its length, and each D symbol with CSADDR plus its
  address. A duplicate name is an error. Then add the length to CSADDR.
- **Pass 2:** copy each section's text to CSADDR plus its address. For each M record,
  look the symbol up in the ESTAB (undefined is an error) and add or subtract
  its value in the field, masked to the field's half-bytes. Fields are aligned
  on the high nibble of the start byte, as `Relocation` documents today.
  - Every M record whose net effect leaves the field relative to the program start
    becomes one relocation record `M <address> <len> +<PROG>` in the output.
    Example: `+RDREC` resolves to a relative address, so it needs relocation at
    load. `+BUFEND −BUFFER` cancels out, so it needs none.
- Output: one linked `ObjectProgram` with a single section named after the entry
  section, the transfer address, the merged source map and the origin of each
  byte range, plus the **trace** (§6.3).

The rule for "net relative": count +1 for each relative symbol added and −1 for
each one subtracted. The net count must end at 0 (absolute) or 1 (relative).
Anything else is an error, which is Beck's relocatability rule for expressions
applied at link time.

### 5.3 Relocating loader

It reads the linked program and the load address. It writes the text at
PROGADDR plus its address and adds PROGADDR to each relocation field. Then it
sets PC to PROGADDR plus the transfer address. With no transfer, it uses PROGADDR
(Beck). The memory write stays all-or-nothing, as `MemoryAccessor::write(CodeMemory)`
already guarantees.

### 5.4 Where it lives in the code

- `backend/lib/sic-xe` (`sicxe_assembler` static lib, next to `MacroProcessor`):
  - `assembler/object_program.hpp`: the data;
  - `linker.hpp/.cpp`: the two passes and the trace;
  - `loader.hpp/.cpp`: relocation;
  - `object_text.hpp/.cpp`: the readable `.obj`/`.out` writer.

  None of them need the CPU DLL.
- **Assembler:** sections, `CSECT`/`EXTDEF`/`EXTREF`/`ENTRY`, a symbol table per
  section, and external terms in expressions. `assembleDetailed` returns the
  `ObjectProgram` alongside today's `AssemblyInfo`.
- **`IArchitecture`:** today it has `load_file(std::string&)`. Add a multi-source load
  that takes the ordered list of (path, text) and the load address. The old
  call becomes a one-element list with address 0.
- **`SICXE::load_file*`:** for each file, macro-process and assemble it, then
  link and load. It emits the events below and keeps today's order and error behavior
  (stop at the first failing stage, with diagnostics remapped to the source).
- **Language server:** per document, unchanged scope. It learns the new directives
  (completion, hover, syntax) and the single-file diagnostics: an external
  reference in format 3, an `EXTDEF` of an undefined symbol, another section's
  symbol used without `EXTREF`, and a nonzero `START` next to `CSECT`.

### 5.5 Protocol

- **Command:**

  ```
  load [@<hex>] %<path> [%<path> ...]
  ```

  For example, `load @1000 %main.asm %dobra.asm`. Order is the link order. The
  paths refer to files already synced to the session project. `load %main.asm`
  keeps today's meaning (address 0). *(My call: the separator is " %", so paths
  with spaces keep working.)*
- **`MacrosExpanded`:** emitted once per file, with a new `source` field naming the
  file. `file` stays `"MASMAPRG.ASM"`.
- **New `ProgramLinked` event:** carries the ESTAB, each source's `.obj` text, the
  `.out` text, the origin ranges for the bands, and the trace. Sent on success.
  On a linker error, it is sent with what was built so far, as `MacrosExpanded`
  does today on failure.
- **`InstructionFetched`:** gains `source_file`, the project file the instruction
  came from. `source_line` stays a line of that file's `MASMAPRG.ASM`.
- **Docs:** `backend/docs/websocket-protocol.md` is updated with examples.

## 6. UI

### 6.1 Editor: two panes, generated files in tabs

```
┌ main.asm (editable) ─────────┬ [MASMAPRG.ASM] [main.obj] [PROG.out] ┐
│ PROG    ENTRY  0             │ H PROG   000000 00001E                │
│ INICIO +JSUB   DOBRA         │ R DOBRA                               │
│ ...                          │ T 000000 12                           │
│                              │   000000  4B100000   +JSUB DOBRA      │
└──────────────────────────────┴───────────────────────────────────────┘
```

- The left pane is the open source. The right pane is read-only, with the tabs
  `MASMAPRG.ASM` (that file's macro output), `<file>.obj` (that file's object
  program) and the linked `<PROG>.out`, which is shown **from every file**, as the
  last tab.
- The right pane follows the active file on the left.
- Generated outputs live in the right pane, not in the file explorer. *(My call:
  with one `MASMAPRG.ASM` and one `.obj` per source, the tree would fill with
  copies. Today's single `MASMAPRG.ASM` explorer entry moves into the tab.)*
- The existing source↔`MASMAPRG.ASM` band reveal keeps working inside the tab.

### 6.2 Readable `.obj` / `.out`

Record lines carry Beck's records with their fields separated by spaces, and the
T record's object code grouped per instruction, as in Beck's figures.
Annotation lines are indented and start with `.` (Beck's comment character). The
rest of a record line after ` .` is an annotation too. Under each T record,
annotations decode its bytes back into instructions:

```
H PROG   000000 00001E
D N      000018 M      00001B
R DOBRA
T 000000 12 4B100000 ...
  .  000000  4B100000   +JSUB DOBRA
  .  000004  ...
M 000001 05 +DOBRA         . +JSUB DOBRA (main.asm:3)
E 000000                   . transfer: INICIO
```

**Comparing against Beck:** drop the annotation lines and everything from ` .` on,
remove all spaces from the record lines, and compare the result with Beck's
column-format records (Fig. 2.17, Fig. 3.9). *(My call.)*

In `.out`, each control section's byte range has a colored band, using the
macro-band mechanism (`EditorBand`) with a label for its origin
(`▌ dobra.asm · DOBRA`). Only relocation M records (`+PROG`) remain.

Decoding uses the assembler's source map and listing, not a disassembler, so
data bytes are never mislabeled as instructions.

### 6.3 Linker tab in the side panel

`ExecutionView` today has the tabs CPU | Assembler | Macros, and Macros splits into
Tables | Trace. Add **Linker** with the same split:

- **Tables:** the ESTAB in the layout of Beck's load map in §3.2.3 (control section, symbol name,
  address, length), plus an Origin column, plus each section's D and R lists.
- **Trace:** one row per step:
  - pass 1: "PROG placed at 000000", "N = 000018";
  - pass 2: each M record, with the field's value before and after and the symbol
    used;
  - loader: the load address and each relocation it applied.

  Clicking a row reveals the record in the `.obj`/`.out` tab and the instruction in
  its source file, as `MacroTrace` does.

### 6.4 Include toggles, Run and load address

- Each source file in the explorer has an include switch. Generated files and hex
  dumps (files starting with `;`) cannot be included.
- **The include set is explicit, and is empty by default:**
  - **No file switched on:** Run works exactly as today. It runs the open file
    (`fileToRun`) as a one-file link, so existing projects behave the same.
  - **Any file switched on:** Run links exactly the switched-on files, whatever file
    is open. The open file is never added implicitly. The Run button shows the
    count ("Run · 3 files").
  - Deleting or renaming a file updates the set. A generated file can never be in it.
- **Link order:** the entry file first, then the others in explorer order (path
  order).
- The explorer marks the entry file (the one with `ENTRY`) with a badge.
- **Load address:** a hex field next to Run, default `0`, validated against the
  memory size, and stored per project with the include set in the browser's
  project store. *(My call: it is UI state, not source.)*
- **Debugging:** when PC moves into another file, the editor switches to that file
  and highlights the line. The Assembler tab's symbol table groups symbols by
  section and origin.
- **Labels:** PT/EN, in `i18n.tsx`.

### 6.5 Default project: a linker tour

A new project (`defaultProjectFiles.ts`) keeps the syntax tour (`main.asm`) and
the macro tour (`macro.asm`), and adds a **linker tour** in a `linker/` folder. It
is the program the video can run end to end. Each file opens with a `.` comment
explaining its part, as the existing tours do.

The tour is the macro tour's `PROG`, split across files:

- `linker/prog.asm`, the entry file: `PROG ENTRY 0`, `EXTDEF`/`EXTREF`, `END INICIO`.
  It keeps one macro (e.g. `DOBRA`), defined and called inside the file, so one Run
  shows the whole chain: macro processor → assembler → linker → loader.
- `linker/maximo.asm`: `MAXIMO` as a subroutine called with `+JSUB`. It reads `N` and
  `M` and writes `MAIOR` through external references (`+LDA N`, ...).
- `linker/dados.asm`: **two control sections in one file** (`START` then `CSECT`). One
  exports data (`K`, `TRIPLO`). The other holds a `WORD` with a single external
  (`WORD MAIOR`, one `+` M record that stays relocatable) and a `WORD` difference of
  two externals (`WORD MAIOR-N`, `+`/`-` records that cancel, so no relocation).

Feature checklist the tour must exercise:
- `ENTRY` and the transfer address;
- three or more files;
- two control sections in one file;
- a format-4 external call and a format-4 external data access;
- a `WORD` external that stays relocatable and one that cancels to absolute;
- a macro inside a linked file.

The tour's files ship **switched off**. Run on `main.asm` works as before, and
switching the three files on in the video shows the toggles. The entry file's
header comment says to switch them on.

The entry file's header comment states the expected memory after the run to
`HALT`, as the macro tour does. It also has a commented-out line
(`. JSUB MAXIMO   ← remove the + to see the format-3 guard`) for the video.

Other changes:
- `main.asm`: the `ENTRY` label is renamed (e.g. `INICIO`). The comment on
  `SHOWCASE START 0x1000` changes from "START sets the load address" to "an absolute
  program: START fixes its address at assembly time" (§4.3).
- `macro.asm`: unchanged.
- Tests that pin the defaults are updated:
  - `backend/tests/api/test/suites/default-sources.js` (each default file assembles,
    and the linker tour links and runs to the stated values);
  - `app/page.test.tsx`;
  - `EditorPage.macros.test.tsx` ("opens with the syntax tour and the macro tour").

## 7. Errors (each one a test first)

| Stage | Condition | Diagnostic points at |
|---|---|---|
| Assembler | external symbol in a format-3 operand | the operand, suggesting `+` |
| Assembler | another section's symbol used without `EXTREF` | the reference |
| Assembler | `EXTDEF` of a symbol not defined in the section | the `EXTDEF` |
| Assembler | external symbol in `EQU`, in `BASE`, or multiplied/divided in an expression | the expression |
| Assembler | nonzero `START`/`ENTRY` in a multi-file link | the directive |
| Assembler | SIC mode: external symbol in an instruction operand | the operand |
| Linker | zero `ENTRY` with 2+ files; two or more `ENTRY` | the files / the second `ENTRY` |
| Linker | `END` with an operand outside the entry file | that `END` |
| Linker | the same external symbol defined twice (Beck: duplicate) | both definitions |
| Linker | `EXTREF` symbol defined nowhere (Beck: undefined external) | the M record's source line |
| Linker | an expression whose net relocation is not 0 or 1 | its source line |
| Linker | a hex-dump file in the link set | the file |
| Loader | linked program does not fit at the load address | the load-address field |
| Loader | a relocated field overflows its half-bytes | the source line |
| Loader | absolute single-file program with a nonzero load address | `START` |

Every error stops the Run before memory changes, as the macro and assembler
errors do today.

## 8. Tests (test-driven, in this order)

1. **Assembler, golden (Beck Fig. 2.15 → 2.17).** COPY/RDREC/WRREC assemble to Beck's
   H/D/R/T/M/E records, compared as in §6.2. Beck's source uses literals
   (`=C'EOF'`, `=X'05'`, `LTORG`), which are not supported and stay out of scope
   (Beck §2.3.1, not linking). The fixture puts labelled `BYTE`s where Beck's
   literal pools sit, which gives the same bytes and records. Extends
   `test_assembler.cpp`. Check the
   expected records against the scanned book, not only the OCR text in
   `resources/parsed/`. The OCR is garbled in places.
2. **Assembler guards:** the assembler rows of §7, one test each.
3. **Linker, golden (Beck Fig. 3.8 → 3.9 → 3.10).** PROGA, PROGB and PROGC (sources in
   Fig. 3.8), one file each, rewritten with `ENTRY` on PROGA:
   - they assemble to the object programs of Fig. 3.9 (record lines);
   - the linker's ESTAB matches the load map in §3.2.3 (PROGA 0000/0063, LISTA,
     ENDA, ...) with addresses relative to 0;
   - **loaded at 4000**, memory matches Fig. 3.10(a), and REF4's field matches the
     worked computation in Fig. 3.10(b).

   New `test_linker.cpp`, registered in `ctest`.
4. **Linker and loader guards:** the remaining rows of §7.
5. **Regression:** the whole existing ctest (87) and API (140) suites stay green.
   The single-file load path through the new code gives byte-identical memory to
   today.
6. **API:** `load @1000 %a %b` over the WebSocket. The event order is
   `MacrosExpanded` ×2, then `ProgramLinked`, then memory writes and PC. The errors
   return the diagnostics. `InstructionFetched.source_file` is checked.
7. **Frontend (vitest):**
   - the include toggles and default;
   - the load-address validation;
   - the right-pane tabs following the active file;
   - the `.out` bands;
   - the Linker tables and trace click-through;
   - the debugger switching files.
8. **Docs:** `backend/docs` gets a linker section next to `macro-processor/`, and
   `grammar.ebnf` gains the four directives.

## 9. Left to the builder

- Exact struct and field names, file layout inside `sicxe_assembler`, event JSON field
  names (documented in `websocket-protocol.md`).
- Colors for the section bands. Reuse the macro band palette.
- How `.obj` tabs are named when two sources in different folders share a stem.
- The `.out` name when the entry section has no label (fallback, e.g. the file
  stem).
