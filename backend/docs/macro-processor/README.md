# SIC/XE macro processor

This document describes the macro processor implemented in this repository:
its language, data structures, functions, algorithm, output, errors, and
integration. Paths are relative to `backend/`. The implementation remains
authoritative if this document and the code ever disagree.

## 1. Overview

The macro processor expands `MCDEFN`/`MCEND` macros before the two-pass
assembler. It reads the source once (one pass) and produces `MASMAPRG.ASM`,
the text that the assembler then assembles. Nested definitions and nested
calls are expanded in that same pass.

One class, `sicxe::MacroProcessor`, serves every caller, so the three never
disagree:

- the simulator load, `SICXE::load_file`;
- the language server, `AssemblerLanguageSession::analyze`;
- the command-line tool `sicxe_macro`.

| Source | Content |
| --- | --- |
| `lib/sic-xe/include/assembler/macro_processor.hpp` | Public API: `MacroProcessor`, `MacroProcessorOptions`, `MacroResult` and its records, `mapToSource`, `remapAssemblyDiagnostics` |
| `lib/sic-xe/src/Assembler/macro_processor.cpp` | The one-pass algorithm (class `OnePass`): definitions, calls, expansion, limits, trace |
| `lib/sic-xe/src/Assembler/macro_text.hpp`, `macro_text.cpp` | Private text rules: the parser's field and comment rules, stored body lines as pieces, substitution, `.SER`, the prototype rule |
| `lib/sic-xe/src/Assembler/macro_remap.cpp` | Positions and assembler diagnostics moved from `MASMAPRG.ASM` back to the source |
| `lib/sic-xe/include/MacroReportJson.hpp`, `lib/sic-xe/src/MacroReportJson.cpp` | `MacroResult` as the JSON details of the `MacrosExpanded` event |
| `lib/sic-xe/tools/sicxe_macro.cpp` | The `sicxe_macro` command-line tool |

`macro_processor.cpp`, `macro_text.cpp` and `macro_remap.cpp` are in
`ASSEMBLER_SOURCES`, the static library `sicxe_assembler`. `MacroReportJson.cpp`
is part of the `sic-xe` architecture library.

Diagrams: [modes of the algorithm](../uml/42_macro_processor_states.puml) and
[source load with the processor](../uml/43_macro_load_sequence.puml).

## 2. Syntax

The syntax is the one in the course slides (Calingaert), version 2 of the
prototype. The examples come from the demo program,
[`macro_demo.asm`](../../lib/sic-xe/test/data/macro_demo.asm).

### Definition

```text
        MCDEFN
[F0]    NAME  [F1, F2, ...]     ; prototype
        body
        MCEND
```

- `MCDEFN` and `MCEND` stand alone on their line. A label or operands there is
  an error.
- The prototype is the next line with content after `MCDEFN`. Blank lines and
  comment lines in between are not the prototype.
- The prototype rule is structural, so it does not depend on columns. Let `t1`
  and `t2` be its first two tokens:
  - when `t2` exists, has no `,` and no `=`, and more text follows it that does
    not start with `,`, then `t1` is the label formal `F0`, `t2` is the name,
    and the rest is the formal list;
  - otherwise `t1` is the name and the rest is the formal list.
  - Examples: `L       SOMA X,Y,Z` gives label formal `L` and name `SOMA`.
    `MAXIMO P=,Q=,R=MAIOR` gives name `MAXIMO`. `ESCALA K` gives name `ESCALA`
    and one formal.
- A name or a formal is an identifier, `[A-Za-z_][A-Za-z0-9_]*`. A macro name
  cannot be an instruction or a directive. A formal may be a register name:
  `MULTK A,C` uses `A`.
- A formal list is separated by commas. `X` is a positional formal. `X=` and
  `X=default` are keyword formals, and the default is the trimmed text after
  `=`. A repeated formal is an error.
- A name can be redefined. The newest definition is used from then on, and the
  older one stays in the definition table, inactive.

### Call

```text
[LABEL]  NAME  [actual1, actual2, ...]
```

- The operation field is found with the assembler's field rule, extended: field
  1 is the operation when it names an instruction, a directive, `MCDEFN`,
  `MCEND`, or a macro defined at that point. Otherwise field 1 is the label.
- A line whose operation names a defined macro is a call. Any other line is
  copied unchanged.
- Actuals are separated by commas outside quotes, and each one is trimmed.
  `IDENT=value`, where `IDENT` is a formal of the macro, is a keyword actual.
  Any other actual is positional: the i-th one goes to the i-th formal, and
  the label formal is not counted.
- An empty actual is `""`. A formal without an actual takes its default, or
  `""`. In the demo, `MAXIMO P=N,Q=M` leaves `R` at its default `MAIOR`.
- The call label:
  - with a label formal, it is actual `#0`. It goes where the body writes the
    label formal; SOMA writes it on its first instruction;
  - without one, the processor emits `LABEL EQU *` before the body.

### Substitution in a stored body

- Substitution happens in the label, operation and operand fields. It never
  happens in a comment (`;` to the end of the line, or a `.` in column 1) or
  inside quotes (`C'..'`, `X'..'`, with the assembler's apostrophe rule).
- An identifier that matches a visible formal is replaced. A token right after
  `$` is a register and is never replaced. Neither is the `C`/`X` of a
  `C'..'`/`X'..'` literal.
- In `#K` and `@K`, `K` is replaced: ESCALA's `MUL #K` becomes `MUL #3`.
- `.NAME`, where `NAME` is a visible formal, is an explicit reference: the dot
  is dropped (`ADD @.B` with `B=1` gives `ADD @1`). A `.X` where `X` is not a
  formal stays as written.
- `.SER` is the system formal. It becomes the serial of the expansion that
  writes the line to the output, with at least three digits: `FIM.SER`
  becomes `FIM003`.
- `MCDEFN`, `MCEND`, macro names, formal names and keywords are
  case-insensitive. Macro names are stored in upper case.
- Lines may end in CRLF. Tabs separate fields like spaces.

## 3. Data structures

`OnePass` is the private class that runs the pass, in `macro_processor.cpp`.
Unless noted otherwise, the other types are in `macro_processor.hpp`.

**Name table.** `MacroResult::names`, a `std::vector<MacroName>`, with
`MacroName { name, definition, line }`.
- It holds one entry per macro name: the upper-case name, the index of its
  active definition, and its prototype line (0 when an expansion created the
  macro).
- An entry is added when a level-1 `MCEND` closes a definition with a new name.
  On a redefinition the entry is pointed at the new definition.
- `OnePass::nameSlot` searches it to decide whether a line is a call.

**Definition table.** `MacroResult::definitions`, a `std::vector<MacroDefinition>`, with
`MacroDefinition { index, name, prototype, labelFormal, formals, active,
originSourceLine, originSerial, hasNested, displayBody, bodySourceLines }`.
`formals` is a `std::vector<Formal>`, with `Formal { name, defaultValue }`.
- It holds every definition, the inactive ones included:
  - `originSourceLine` is the `MCDEFN` line, when the definition is written in
    the source;
  - `originSerial` is the expansion that created it, otherwise;
  - `hasNested` is true when its body contains an `MCDEFN`.
- `displayBody` is the display form: the prototype first and `MCEND` last.
  Markers show as `#i` (`#0` for the label formal), or always as `#(d,i)` when
  `hasNested` is true. `bodySourceLines` gives each line's source line, or 0.
- The expansion reads the stored body, not the display form. That is
  `OnePass::bodies_`, a `std::vector<std::vector<PieceLine>>` parallel to the table.
  A `PieceLine` (in `macro_text.hpp`) is a `std::vector<Piece>`, with
  `Piece { kind, text, level, index }`, where `kind` is `Text`, `Param` or
  `Serial`.
  - `Param{level, index}` is the marker `#(level,index)`, with levels counted
    from the definition that stores the line.
  - A marker is a piece, never text with `#`. So a written `#1` stays an
    immediate: ESCALA's `MUL #K` is stored as the text `#` and a marker, and
    displays as `MUL ##(1,1)`.
- A definition being read lives in `OnePass::current_`, a `DefinitionInProgress`.
  `OnePass::closeDefinition` enters it in both tables at the level-1 `MCEND`, unless
  its prototype was missing or its name is unusable. `active` turns false when a
  redefinition replaces it.

**Formal-parameter stack.** `OnePass::formals_`, a `std::vector<FormalEntry>`, with
`FormalEntry { upper, level, index }`.
- When the prototype of level `d` is read, its label formal (index 0) and its
  formals (1..n) are pushed with level `d`. The `MCEND` of level `d` pops them.
- `OnePass::findFormal` searches it from the top. A source line stored at level `d`
  has every token that matches turned into `Param{level, index}`.
- A nested prototype keeps its own formal names as written. Only names of
  enclosing levels become markers.

**Actual-parameter list.** `Frame::actuals`, a `std::vector<std::string>` with
entries `#0..#n`.
- `#0` is the call label when the prototype has a label formal, and `""`
  otherwise. `#i` is the value bound to formal `i`.
- `OnePass::bindActuals` builds it once per call. It is copied to `Expansion::actuals`,
  a `std::vector<Actual>` with `Actual { index, formal, value }`, for the
  report.

**Expansion stack.** `OnePass::frames_`, a `std::vector<Frame>`, with
`Frame { definition, next, actuals, serial, call, crlf, expansion }`.
- `next` is the read pointer into the stored body: 0 is the prototype, and the
  last line is `MCEND`.
- `call` is the macro name of the outermost call. Generated lines map to its
  line, and errors found while expanding are reported there.
- `crlf` makes generated lines end in `\r` when that call line did.
  `expansion` indexes `MacroResult::expansions`.
- A call pushes a frame. Reading the body's `MCEND` pops it, and a limit stop
  clears the stack.
- Each expansion is also recorded in `MacroResult::expansions`, a
  `std::vector<Expansion>`, with `Expansion { serial, macro, definition, parent,
  depth, callLine, callText, actuals, outputFrom, outputTo }`. The record is
  added at the call, and `outputTo` is set when the expansion ends.

**Definition level `d`.** `OnePass::d()` returns `OnePass::levels_.size()`. `levels_` is a
`std::vector<SourceRange>` with one entry per open `MCDEFN`: where it was read,
for `MCDEFN without MCEND`. `MCDEFN` pushes an entry (d + 1), and `MCEND` pops
one (d − 1).

**Expansion flag `e`.** It is not stored: `e` is `!frames_.empty()`. Each trace
step records it as `TraceStep::e`, with `TraceStep::depth = frames_.size()`.

**Serial counter.** `OnePass::serial_`, an `int`: the serial of the last expansion.
It starts at 0, and each call adds 1. It is never reset, and `maxExpansions`
bounds it.

**Line map.** `MacroResult::lineMap`, a `std::vector<LineOrigin>`, with
`LineOrigin { output, source, kind, serial }` and
`enum class LineKind { Verbatim, Call, Label, Expanded }`. There is one entry per
output line, added by `OnePass::emit` (section 6).

**Trace.** `MacroResult::trace`, a `MacroTrace { steps, truncated }`, with
`TraceStep { step, fromExpansion, line, serial, d, e, depth, text, action,
targetOutput, targetDefinition, targetBodyLine, targetSerial }` and
`enum class TraceAction { Copy, DefineStart, Prototype, Store, DefineEnd, Call,
ReadPrototype, ExpansionEnd, Error }`.
- There is one step per line read, from the source or from an expansion.
  - `line` is the source line, or the body line for an expansion, where 1 is
    the prototype.
  - `d` and `e` are the values before the line, as in Figure 4.12.
  - The code that handles the line sets the action and its target.
  - A line that reports an error is an `Error` step with no target.
- The empty segment after a final newline is not a line, so it has no step.
- After `maxTraceSteps` steps, the trace stops growing and `truncated` is set.

`OnePass` also keeps `awaitingPrototype_` (the next line with content is a
prototype), `readBytes_` (bytes read from expansions), `stopped_` and the
diagnostics, `diags_`.

## 4. Functions

### Public API

| Declaration | Purpose |
| --- | --- |
| `explicit MacroProcessor(MacroProcessorOptions options = {})` | Stores the options. An empty `isOperation` becomes `findInstruction(upper) != nullptr \|\| findDirective(upper).has_value()` |
| `MacroResult MacroProcessor::process(std::string_view source) const` | Splits the source at `\n` and runs the pass. It never throws for source problems |
| `MacroProcessorOptions` | `isOperation`, `maxDepth` (64), `maxExpansions` (2000), `maxOutputLines` (20000), `maxOutputBytes` (1048576), `maxTraceSteps` (5000) |
| `MacroResult` | `text` (MASMAPRG.ASM), `lineMap`, `diagnostics` (source positions, by line), `names`, `definitions`, `expansions` (in serial order), `trace`, `hasMacros`, `stopped` |
| `bool MacroResult::ok() const` | True when no diagnostic is an `Error` |
| `MacroResult::stopped` | A limit ended the processing, so `text` is partial. A truncated trace is not a stop. `stopped` implies `!ok()` |
| `MacroResult::hasMacros` | An `MCDEFN` was read (a call needs one) |
| `kMacroOutputFile` | `"MASMAPRG.ASM"` |
| `SourceSpan mapToSource(r, source, outputLine, outputColumn, length)` | A verbatim line keeps its column. An expansion line maps to the macro name on the outermost call line, with `synthetic` set |
| `remapAssemblyDiagnostics(r, source, assembled)` | Assembler diagnostics of `r.text` moved to `source` (section 7) |
| `nlohmann::json macroReportJson(const MacroResult& r)` | The `MacrosExpanded` details (`MacroReportJson.hpp`) |

### Internal functions

| Function | Purpose |
| --- | --- |
| `OnePass::read` | Processes one source line, then drains the expansion stack. It does nothing after a stop |
| `OnePass::expand` | Reads lines from the top frame until the stack is empty: prototype, body, `MCEND` |
| `OnePass::process` | Handles one line, from the source or an expansion, by the Normal / Definition / Expansion logic |
| `OnePass::fields` | Splits a line into label, operation and operands, by the extended field rule |
| `OnePass::defineStart`, `defineEnd` | `MCDEFN` and `MCEND`: `d`, nested storage, closing a definition |
| `OnePass::prototype`, `checkPrototype` | Reads a prototype, pushes its formals, and checks its name and formals |
| `OnePass::store`, `bodyLine`, `findFormal` | Stores a line in the current definition, turning formals on the stack into markers |
| `OnePass::closeDefinition`, `checkMarkers` | Enters a level-1 definition in the tables. For one an expansion created, it checks its markers against its prototype |
| `OnePass::call` | A call: checks the limits, binds the actuals, pushes a frame, and emits the `.` line and `EQU *` |
| `OnePass::bindActuals`, `formalIndex` | Binding: keyword and positional actuals, defaults, `#0` from the call label |
| `substitute`, `substitutedLength` (`macro_text`) | `#(1,i)` becomes actual `i`, and `#(k,i)` becomes `#(k-1,i)`. The second gives the length of the result without building it |
| `toPieces`, `parsePrototype`, `displayForm`, `outputText`, `serialText` (`macro_text`) | Marker recognition, the prototype rule, the display form, output text with `.SER`, the 3-digit serial |
| `OnePass::copy`, `emitGenerated`, `emit` | Emission: a source line byte for byte, or a generated line with the call line's ending. `emitGenerated` checks the output limits |
| `OnePass::stop` | A limit: the error goes at the outermost call, open expansions end, the stack is cleared, and `stopped` is set |
| `OnePass::finish` | End of text: `Missing prototype after MCDEFN`, and `MCDEFN without MCEND` for each open level, unless stopped |
| `OnePass::beginStep`, `endStep`, `traceAs`, `untarget` | The trace: one step per line read, its action and its target |
| `expansionPrefix`, `withSourceLine`, `callName` (`macro_remap.cpp`) | Remap helpers: the "In expansion of" prefix, the "(first defined on line N)" rewrite, and the call's name span |

## 5. Algorithm

The algorithm is the one-pass macro processor of Calingaert, figures 4.5,
4.11 and 4.18 of the slides. The trace reproduces figure 4.12, and the `#(d,i)`
display follows figure 4.10.

```text
MacroProcessor::process(source):
  for each segment of source split at '\n':
    OnePass::read(segment)          -- nothing once stopped
  OnePass::finish()

OnePass::read(line):
  process(line)
  expand()

OnePass::expand():                  -- the next line comes from the top frame
  while frames not empty:
    top = frames.top;  i = top.next;  top.next = i + 1
    add the length of stored line i to the bytes read      -- limit
    line = substitute(body(top)[i], top.actuals)          -- .SER filled when d = 0
    if i = 0:            read the prototype; nothing else
    else if i is last:   end of expansion (its MCEND); pop top
    else:                process(line)

OnePass::process(line):
  if a prototype is awaited and line is not MCDEFN/MCEND:
    blank or comment: dropped at d = 1, stored at d > 1
    otherwise: push its formals with level d; at d = 1 it names the
               new definition, deeper it is stored
  else:
    (if a prototype was awaited: error "Missing prototype after MCDEFN")
    MCDEFN:            d = d + 1; d = 1 starts a definition, d > 1 stores
                       the line; a prototype is awaited
    MCEND, d = 0:      error "MCEND without MCDEFN"
    MCEND, d > 0:      pop the formals of level d; store the line;
                       d = d - 1; d = 0 closes the definition
    other, d > 0:      store (a source line has its formals turned into markers)
    other, macro call: call(line)
    other:             copy to MASMAPRG.ASM

OnePass::call(line):
  check depth and expansion count                           -- limits
  actuals = bindActuals(...);  check each actual's size     -- limit
  serial = serial + 1;  push a frame
  emit "." + line;  emit "LABEL EQU *" when the call has a label
                    and the prototype has no label formal
```

**Where a line comes from.** If the expansion stack is not empty, the next line
comes from the top frame, already substituted. Otherwise it comes from the
source. A source line is read only after the stack is empty again.

**Modes.** The mode is a function of `d` and `e`:

| Mode | Condition | Effect on a line |
| --- | --- | --- |
| Normal | `d = 0`, `e = false` | A source line is copied or is a call |
| Definition | `d > 0` | The line, from the source or from an expansion, is stored in the current definition. Calls in it are stored too |
| Expansion | `d = 0`, `e = true` | A body line is copied (with `.SER` filled in), is a nested call, or opens a definition |

The Trace view lights Definition when `d > 0` or the step is the `MCDEFN` that
opens a definition (`define-start`). Otherwise it lights Expansion when `e` is
true, and Normal when it is not. See `modeOf` in
`frontend/src/components/MacroTrace.tsx` and
[diagram 42](../uml/42_macro_processor_states.puml).

**Nested definitions.** Take Figure 4.12 (section 11.2).
- While A's body is read, `LOAD FORMAL1` matches A's formal (level 1, index 1)
  and is stored as `LOAD #(1,1)`.
- B's prototype, at `d = 2`, pushes `FORMAL2` with level 2. So `STORE FORMAL2`
  is stored in A as `STORE #(2,1)`, and B's `MCEND` pops it.
- Expanding A replaces each level-1 marker with its actual and moves every
  deeper marker up one level: `#(1,1)` becomes `ACTUAL1`, and `#(2,1)` becomes
  `#(1,1)`.
- So the `MCDEFN` read from the expansion creates B with `STORE #(1,1)` (trace
  step 14), displayed `STORE #1`.
- The demo does the same with ESCALA: expansion `#004`, with `K = 3`, creates
  MULTK as `LDA #(1,1)`, `MUL #3`, `STA #(1,2)`.

**A definition made by an expansion** enters the tables when its `MCEND` is
read. That happens before the next source line, which can already call it: the
demo's `MULTK N,TRIPLO` (line 33) calls the macro that `ESCALA 3` (line 32)
created. The name table shows `#004` for it.

**Nested calls.** A call inside a body is stored as text. When the body is
expanded, the line is read at `d = 0`, and its operation names a defined
macro, so it is a call.
- In the demo, DOBRA's stored line `#0       SOMA #1,#1,#1` becomes
  `INICIO       SOMA N,N,N` in expansion `#001`.
- Frame `#002` is pushed over `#001`, so `e` is true with depth 2 (steps
  33-37).
- `#001` continues with its `MCEND` when `#002` ends (step 38).

**`.SER`.** It is replaced only when the line goes to the output (`d = 0`), by
the serial of the frame that emits it. A line stored in a definition keeps
`.SER` as written. MAXIMO's expansion `#003` writes `JGT FIM003` and
`FIM003 STA MAIOR`.

**Why one pass is enough.**
- A macro must be defined before its call, so when a line is read, the name
  table already says whether it is a call.
- A call is expanded at once: its frame is drained before the next source line
  is read.
- A definition nested in a body is stored as text, with its markers one level
  deeper. It becomes a definition only when an expansion reads it, and it is in
  the tables for the next line.
- So each source line is read exactly once, and no later line changes how an
  earlier one was processed.

## 6. MASMAPRG.ASM and the line map

- A source line outside definitions (`d = 0`) that is not a call is copied byte
  for byte, with its `\r`, comment and spelling. Its kind is `verbatim`.
- Definitions, from `MCDEFN` to `MCEND`, do not appear in the output.
- A call, top-level or nested, produces these lines:
  - first a `.` comment line with the call text, kind `call`. A nested call
    shows its actuals already substituted;
  - then `LABEL EQU *` when it applies, kind `label`;
  - then the expanded body, kind `expanded`.
- Comments and blank lines in a body are emitted at every expansion.
- A call's label, through the label formal `#0`, lands where the body writes
  it. `INICIO  DOBRA N` produces `INICIO       LDA N`.
- Lines are joined with `\n`. A generated line ends in `\r` when the outermost
  call line did, so a CRLF source stays CRLF.
- There is no header. A source without `MCDEFN`, `MCEND` or calls comes out
  byte for byte identical: tabs, `\r` and the final newline included, with an
  identity line map.

Each `LineOrigin` of the line map has these fields:
- `output`: the 1-based line in MASMAPRG.ASM;
- `source`: the line's own source line for `verbatim`, or the line of the
  outermost call for `call`, `label` and `expanded`;
- `kind`: one of `verbatim`, `call`, `label` or `expanded`;
- `serial`: the innermost expansion that emitted the line, 0 for `verbatim`.

When the source ends with a newline, the empty segment after it is copied too,
so the output keeps the newline. It gets a `verbatim` entry but no trace step:
the demo's map has 25 entries, and the last one is source line 40.

Users of the map:
- `remapAssemblyDiagnostics` and `mapToSource`, for load errors and for the
  language server;
- the editor's Step: it highlights `InstructionFetched.source_line` in
  MASMAPRG.ASM, and `lineMap[source_line - 1].source` in the source as a
  secondary highlight (`sourceLineForOutput`).

The coloured bands do not use the map. They come from `expansions`: each
top-level call gets its `callLine` and its `output` range.

## 7. Errors and limits

Errors are `Diagnostic`s in source positions. A line read from the source
reports at the offending token. A line read from an expansion reports at the
macro name on the **outermost** call line.

| Message | When | Where |
| --- | --- | --- |
| `MCDEFN takes no label or operands`, `MCEND takes no label or operands` | Label or operands on that line | The label, else the operands |
| `MCEND without MCDEFN` | `MCEND` at `d = 0` | The `MCEND` |
| `Missing prototype after MCDEFN` | `MCDEFN`, `MCEND` or end of text before a line with content | The `MCDEFN` |
| `MCDEFN without MCEND` | End of text with `d > 0`; not reported after a limit stop | Each open `MCDEFN` |
| `Invalid macro name 'X'` | The prototype's name is not an identifier | The name |
| `'X' is an instruction and cannot be a macro name`, `'X' is a directive and cannot be a macro name` | The name is an instruction or a directive | The name |
| `Invalid formal 'X' in prototype`, `Duplicate formal 'X' in prototype` | Not an identifier, or repeated; the formal is dropped | The formal |
| `Body of NAME uses parameter #i but its prototype has N`, `Body of NAME uses parameter #0 but its prototype has no label formal` | A definition created by an expansion whose substituted prototype has fewer formals than its body uses; the marker expands to `""` | Where its `MCDEFN` was read: the outermost call |
| `Unknown keyword 'K' for NAME` | A keyword actual names no formal | The actual |
| `Too many arguments for NAME (expects N)` | More positional actuals than formals; once per call | The first extra actual |
| `Argument 'X' given twice` | A formal gets a second value; the first one is kept | The repeated actual |
| `Macro expansion too deep (limit 64): NAME` | A call deeper than `maxDepth` | The outermost call |
| `Too many macro expansions (limit 2000)` | One more call after `maxExpansions` | The outermost call |
| `Macro output too long (limit 20000 lines)` | `maxOutputLines` reached when an expansion emits | The outermost call |
| `Macro output too long (limit 1048576 bytes)` | `maxOutputBytes` passed (see the limits table) | The outermost call |

Notes:
- The prototype checks run on level-1 prototypes. A nested prototype is checked
  when an expansion makes it a level-1 one.
- A definition with a missing prototype or an unusable name does not enter the
  tables.
- An actual in error is ignored, and the call is still expanded.
- The limit numbers in the messages come from the options. The table shows
  the defaults.

**Remapped assembler errors.** `remapAssemblyDiagnostics` moves each assembler
diagnostic of MASMAPRG.ASM to the source:
- a `verbatim` line keeps its column;
- a line produced by an expansion goes to the macro name on the outermost call
  line. Its message gets the prefix `In expansion of NAME (#NNN, MASMAPRG.ASM:L): `,
  which names the innermost expansion and the MASMAPRG.ASM line;
- `(first defined on line N)` is rewritten to the source line;
- `Missing END directive` keeps its exact text, and only its position moves.

For example, a Run of this source:

```text
        MCDEFN
        CARREGA X
        LDA X
        MCEND
PROG    START 0
        CARREGA NADA
        END PROG
```

fails with this `detail` (MASMAPRG.ASM line 3 is `        LDA NADA`):

```text
6:9: error: In expansion of CARREGA (#001, MASMAPRG.ASM:3): Undefined symbol 'NADA'
```

**Limits.** Every limit except the trace is an error, and it ends the
processing (`OnePass::stop`):
- the error goes at the outermost call;
- the open expansions end with the output produced so far;
- `stopped` is set;
- no further line is read.

| Limit | Option | Default | Checked |
| --- | --- | --- | --- |
| Expansion depth | `maxDepth` | 64 | At each call |
| Total expansions | `maxExpansions` | 2000 | At each call |
| Output lines | `maxOutputLines` | 20000 | On the whole output, when an expansion emits a line |
| Output bytes | `maxOutputBytes` | 1048576 (1 MiB)¹ | On the whole output when an expansion emits a line, on each bound actual, and on every line an expansion reads |
| Trace steps | `maxTraceSteps` | 5000 | At each line read. Beyond it the trace is truncated (`trace.truncated`) and processing goes on. The CLI and the UI show a notice; there is no error |

¹ The limit matches the language server's document limit. Every line an
expansion reads counts, with its line break, before it is built: the prototype
and `MCEND` read again, and lines stored in definitions. A line that repeats a
formal (`DOBRA V+V`) doubles at each level, so this check is what bounds
memory. The error can therefore fire with MASMAPRG.ASM slightly under 1 MiB.
Only generated text is checked, so a source copied as is is never cut.

**A processor error stops the pipeline.**
- On the Run path, `SICXE::load_file` throws the processor's diagnostics before
  `assembleDetailed`, so the assembler does not run.
- In the language server, only the processor's diagnostics are published. The
  assembler still analyzes the output for hover and definition, except after a
  limit stop (`stopped`): then it is not called at all.

## 8. Limitations

- **Spec §4.1.** A macro without parameters cannot have a label formal:
  `L NAME` is read as macro `L` with the formal `NAME`.
- **Spec §4.2.** `BUF,$X` cannot be passed as one actual. A comma outside quotes
  always separates actuals, so `M BUF,$X` against a one-formal `M` reports
  `Too many arguments for M (expects 1)`.
- **Spec §4.3.** The `=` marker in a body, slide 20's `L= LOAD A=`, is not
  supported.
- **Non-goals (spec §2):**
  - conditional macros (`AIF`/`AGO`);
  - parameter concatenation;
  - `&SYSLIST`;
  - Beck's syntax (`MACRO`/`MEND`/`&PARAM`);
  - the "version 1" prototype `INCR MCDEFN L,A`, which reports
    `MCDEFN takes no label or operands`;
  - a forward reference to a macro. A call before the definition is copied
    unchanged, and the assembler judges it.
- **An output that starts with `;`.** A source that starts with a definition
  followed by a `;` comment line gives a MASMAPRG.ASM that starts with `;`.
  This is harmless:
  - `SICXE::load_file` chooses its hexadecimal-dump branch from the original
    source, not from MASMAPRG.ASM;
  - the editor never uses MASMAPRG.ASM as the entry point.

  Only the CLI's file, fed back by hand as a source, would load as a dump.
  Avoiding it would need a header or a changed verbatim line, and both would
  break the byte-for-byte identity.

## 9. Integration

**Load.** In `SICXE::load_file` (`lib/sic-xe/src/SICXE.cpp`), a source that does
not start with `;` goes through these steps:
1. `MacroProcessor().process(content)`.
2. The `MacrosExpanded` event with `macroReportJson(macros)`, emitted before
   assembling. The event is a non-mutating `IEvent`, in
   `include/architecture/events/MacrosExpanded.hpp`.
3. If `!macros.ok()`: `throw std::runtime_error(formatDiagnostics(macros.diagnostics))`.
4. `m_assembler.assembleDetailed(macros.text)`. On failure, it throws the
   diagnostics from `remapAssemblyDiagnostics`.
5. On success, the image is loaded and the PC is set to the entry point.
   `ProgramAssembled` is emitted.

The event is recorded before any throw, so the server's error response
carries it in `error.events`. `instructionSourceMap` and
`InstructionFetched.source_line` are lines of MASMAPRG.ASM, the assembled text.
See [diagram 43](../uml/43_macro_load_sequence.puml).

**Event payload.** The `details` object holds these fields:
- `file` (always `MASMAPRG.ASM`), `ok`, `hasMacros` and `text`;
- `diagnostics` and `names`;
- `definitions`, with `body` in display form;
- `expansions`, with `actuals` and the `output` range;
- `lineMap`;
- `trace`, with `truncated` and `steps`.

The full field list and an example are in
[websocket-protocol.md](../websocket-protocol.md#macrosexpanded).

**Frontend.**
- After a Run with macros, `applyMacroReport` stores `text` as
  `MASMAPRG.ASM` at the project root. A Run without macros removes an old one.
- The file is read-only, shows the `generated` badge, and is never the entry
  point.
- After a Run with macros, the editor can show the source and MASMAPRG.ASM
  side by side, with coloured bands; a toggle hides the second pane. Each band
  links a top-level call to its output block.
- The Execution View's `Macros` tab has two sub-tabs:
  - `Tables`: Macros, Definitions and Expansions;
  - `Trace`: the steps, ◀ ▶ and a slider, the Normal / Definition / Expansion
    pills, and the truncation notice.

**Language server.** `AssemblerLanguageSession::analyze` runs the same
processor, then assembles its output:
- processor diagnostics are already in source positions;
- assembler diagnostics are remapped;
- definition, references and rename map their places back to the source.

See [language-server.md](../language-server.md#sources-with-macros).

## 10. Command-line tool

```text
usage: sicxe_macro <input> [-o <dir>] [--tables] [--trace]
```

- The tool reads `<input>`, runs `MacroProcessor()` with the default options
  (SIC/XE instructions and directives), and writes `<dir>/MASMAPRG.ASM`.
  `<dir>` defaults to the current directory and is created if needed. The file
  is written even when there are errors, so a partial expansion can be read.
- Diagnostics go to standard error as `<input>:line:column: error: message`.
- `--tables` prints the name table, the definition table and the expansions.
  In the name table, `Lines` runs from the `MCDEFN` line to the `MCEND` line,
  or names the expansion that created the macro. `--trace` prints the trace.
  In both, tabs and carriage returns print as spaces.
- Exit codes:
  - 0: no error;
  - 1: macro errors;
  - 2: a usage error (no input, an unknown option or extra argument, a bare
    `-o`) or an I/O error (the input cannot be read or is a directory, or the
    output cannot be written).
- Build: the target `sicxe_macro` is in `lib/sic-xe/CMakeLists.txt`. From
  `backend/`, run `cmake --build build --target sicxe_macro`, or build
  everything. The binary is `backend/bin/sicxe_macro`.

A macro that calls itself, saved as `recursive.asm`:

```text
        MCDEFN
        R
        R
        MCEND
PROG    START 0
        R
        END PROG
```

```text
$ bin/sicxe_macro recursive.asm -o <dir>
recursive.asm:6:9: error: Macro expansion too deep (limit 64): R
```

The exit status is 1. `<dir>/MASMAPRG.ASM` holds the output produced before
the stop.

## 11. Worked examples

All outputs below are the real output of `bin/sicxe_macro`, built from this
branch.

### 11.1 The demo program

Input: [`lib/sic-xe/test/data/macro_demo.asm`](../../lib/sic-xe/test/data/macro_demo.asm).
It is also a fixture of the processor, CLI, language server and API tests. The
macros are:
- `SOMA`, with a label formal;
- `DOBRA`, a nested call of `SOMA`;
- `MAXIMO`, with keyword formals, a default and `.SER`;
- `ESCALA`, which holds a nested definition of `MULTK`.

```text
bin/sicxe_macro --tables --trace lib/sic-xe/test/data/macro_demo.asm -o <dir>
```

`<dir>/MASMAPRG.ASM`:

```text
. Demo do processador de macros
PROG    START 0x0000
.INICIO  DOBRA N              ; N = 10
.INICIO       SOMA N,N,N
INICIO       LDA N
        ADD N
        STA N
.        MAXIMO P=N,Q=M       ; MAIOR = 10
        LDA N
        COMP M
        JGT FIM003
        LDA M
FIM003 STA MAIOR
.        ESCALA 3             ; cria MULTK com K = 3
.        MULTK N,TRIPLO       ; TRIPLO = 30
        LDA N
        MUL #3
        STA TRIPLO
        HALT
N       WORD 5
M       WORD 7
MAIOR   RESW 1
TRIPLO  RESW 1
        END INICIO
```

`--tables`:

```text
Name table
Name    Prototype             Lines
------  --------------------  -----
SOMA    L       SOMA X,Y,Z    2-7
DOBRA   L       DOBRA V       8-11
MAXIMO  MAXIMO P=,Q=,R=MAIOR  12-19
ESCALA  ESCALA K              20-28
MULTK   MULTK A,C             #004

Definition table

SOMA — defined at line 2
  1  L       SOMA X,Y,Z           ; Z = X + Y
  2  #0       LDA #1
  3          ADD #2
  4          STA #3
  5          MCEND

DOBRA — defined at line 8
  1  L       DOBRA V              ; V = 2 * V   (chamada aninhada de SOMA)
  2  #0       SOMA #1,#1,#1
  3          MCEND

MAXIMO — defined at line 12
  1          MAXIMO P=,Q=,R=MAIOR ; R = max(P, Q)   (palavra-chave com padrao e .SER)
  2          LDA #1
  3          COMP #2
  4          JGT FIM.SER
  5          LDA #2
  6  FIM.SER STA #3
  7          MCEND

ESCALA — defined at line 20
  1          ESCALA K             ; define MULTK com a constante K   (definicao aninhada)
  2          MCDEFN
  3          MULTK A,C            ; C = A * K
  4          LDA #(2,1)
  5          MUL ##(1,1)
  6          STA #(2,2)
  7          MCEND
  8          MCEND

MULTK — created by expansion #004
  1          MULTK A,C            ; C = A * K
  2          LDA #1
  3          MUL #3
  4          STA #2
  5          MCEND

Expansions
#       Macro   Arguments                 Output
------  ------  ------------------------  ------
#001    DOBRA   #0=INICIO #1=N            3-7
  #002  SOMA    #0=INICIO #1=N #2=N #3=N  4-7
#003    MAXIMO  #1=N #2=M #3=MAIOR        8-13
#004    ESCALA  #1=3                      14-14
#005    MULTK   #1=N #2=TRIPLO            15-18
```

`--trace`, excerpt. Steps 8–28, 39–46 and 57–67 are omitted, and every row
shown is verbatim. Steps 1–7 define SOMA. Steps 29–38 are the DOBRA call and
the SOMA call nested in it (`true ×2`). Steps 47–56 are ESCALA defining MULTK
during expansion `#004`.

```text
Trace
Step  Read           d  e        Text                                                                                  Action
----  -------------  -  -------  ------------------------------------------------------------------------------------  --------------------------
1     line 1         0  false    . Demo do processador de macros                                                       copy → output 1
2     line 2         0  false            MCDEFN                                                                        define start
3     line 3         1  false    L       SOMA X,Y,Z           ; Z = X + Y                                              prototype → SOMA line 1
4     line 4         1  false    L       LDA X                                                                         store → SOMA line 2
5     line 5         1  false            ADD Y                                                                         store → SOMA line 3
6     line 6         1  false            STA Z                                                                         store → SOMA line 4
7     line 7         1  false            MCEND                                                                         define end → SOMA line 5
29    line 29        0  false    PROG    START 0x0000                                                                  copy → output 2
30    line 30        0  false    INICIO  DOBRA N              ; N = 10                                                 call → expansion #001
31    #001 · line 1  0  true     L       DOBRA V              ; V = 2 * V   (chamada aninhada de SOMA)                 read prototype
32    #001 · line 2  0  true     INICIO       SOMA N,N,N                                                               call → expansion #002
33    #002 · line 1  0  true ×2  L       SOMA X,Y,Z           ; Z = X + Y                                              read prototype
34    #002 · line 2  0  true ×2  INICIO       LDA N                                                                    copy → output 5
35    #002 · line 3  0  true ×2          ADD N                                                                         copy → output 6
36    #002 · line 4  0  true ×2          STA N                                                                         copy → output 7
37    #002 · line 5  0  true ×2          MCEND                                                                         end of expansion
38    #001 · line 3  0  true             MCEND                                                                         end of expansion
47    line 32        0  false            ESCALA 3             ; cria MULTK com K = 3                                   call → expansion #004
48    #004 · line 1  0  true             ESCALA K             ; define MULTK com a constante K   (definicao aninhada)  read prototype
49    #004 · line 2  0  true             MCDEFN                                                                        define start
50    #004 · line 3  1  true             MULTK A,C            ; C = A * K                                              prototype → MULTK line 1
51    #004 · line 4  1  true             LDA #(1,1)                                                                    store → MULTK line 2
52    #004 · line 5  1  true             MUL #3                                                                        store → MULTK line 3
53    #004 · line 6  1  true             STA #(1,2)                                                                    store → MULTK line 4
54    #004 · line 7  1  true             MCEND                                                                         define end → MULTK line 5
55    #004 · line 8  0  true             MCEND                                                                         end of expansion
56    line 33        0  false            MULTK N,TRIPLO       ; TRIPLO = 30                                            call → expansion #005
```

### 11.2 Figure 4.12

The input is `FIGURE_4_12_INPUT` of `lib/sic-xe/test/test_macro_processor.cpp`:

```text
MCDEFN
A FORMAL1
LOAD FORMAL1
MCDEFN
B FORMAL2
STORE FORMAL2
MCEND
MCEND
A ACTUAL1
B ACTUAL2
```

Saved as `fig412.asm`:

```text
bin/sicxe_macro --tables --trace fig412.asm -o <dir>
```

`<dir>/MASMAPRG.ASM`:

```text
.A ACTUAL1
LOAD ACTUAL1
.B ACTUAL2
STORE ACTUAL2
```

Standard output:

```text
Name table
Name  Prototype  Lines
----  ---------  -----
A     A FORMAL1  1-8
B     B FORMAL2  #001

Definition table

A — defined at line 1
  1  A FORMAL1
  2  LOAD #(1,1)
  3  MCDEFN
  4  B FORMAL2
  5  STORE #(2,1)
  6  MCEND
  7  MCEND

B — created by expansion #001
  1  B FORMAL2
  2  STORE #1
  3  MCEND

Expansions
#     Macro  Arguments   Output
----  -----  ----------  ------
#001  A      #1=ACTUAL1  1-2
#002  B      #1=ACTUAL2  3-4

Trace
Step  Read           d  e      Text           Action
----  -------------  -  -----  -------------  ---------------------
1     line 1         0  false  MCDEFN         define start
2     line 2         1  false  A FORMAL1      prototype → A line 1
3     line 3         1  false  LOAD FORMAL1   store → A line 2
4     line 4         1  false  MCDEFN         store → A line 3
5     line 5         2  false  B FORMAL2      store → A line 4
6     line 6         2  false  STORE FORMAL2  store → A line 5
7     line 7         2  false  MCEND          store → A line 6
8     line 8         1  false  MCEND          define end → A line 7
9     line 9         0  false  A ACTUAL1      call → expansion #001
10    #001 · line 1  0  true   A FORMAL1      read prototype
11    #001 · line 2  0  true   LOAD ACTUAL1   copy → output 2
12    #001 · line 3  0  true   MCDEFN         define start
13    #001 · line 4  1  true   B FORMAL2      prototype → B line 1
14    #001 · line 5  1  true   STORE #(1,1)   store → B line 2
15    #001 · line 6  1  true   MCEND          define end → B line 3
16    #001 · line 7  0  true   MCEND          end of expansion
17    line 10        0  false  B ACTUAL2      call → expansion #002
18    #002 · line 1  0  true   B FORMAL2      read prototype
19    #002 · line 2  0  true   STORE ACTUAL2  copy → output 4
20    #002 · line 3  0  true   MCEND          end of expansion
```

- A's body holds its own formal as `#(1,1)` (line 2) and B's formal, one level
  deeper, as `#(2,1)` (line 5).
- Expansion `#001` turns them into `ACTUAL1` (step 11) and `#(1,1)`
  (step 14), so B is stored as `STORE #1`.
- Line 10 calls that new B (step 17).
- The test `figure_4_12_trace` checks this read order and these `d` and `e`
  columns, the sequence of Figure 4.12.
