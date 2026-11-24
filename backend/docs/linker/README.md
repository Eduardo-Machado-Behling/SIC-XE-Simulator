# Linker and relocating loader

Stage 4 of the simulator joins several separately assembled files into one program and
loads it at an address chosen at load time. It follows Beck, *System Software* (§2.3.5
control sections, §3.2.3 the linking algorithm, §3.4.1 linkage editors): the linker is a
**linkage editor**, and the loader is a simple **relocating loader** (Beck Fig. 3.13b).

The design is in `docs/superpowers/specs/2026-11-24-linker-design.md`; this document describes
what is implemented.

## Pipeline

```text
for each included file (the ENTRY file first, then the others in the order given):
    macro processor  ->  MASMAPRG.ASM text
    assembler        ->  ObjectProgram: one ControlSection per START/CSECT
linker   pass 1      ->  where each section goes, the ESTAB
         pass 2      ->  one linked ObjectProgram, relative to 0
loader               ->  adds the load address (PROGADDR) to the relative fields, builds the image
```

All three stages live in the `sicxe_assembler` static library and need no CPU:

| Stage | Header | Source |
|---|---|---|
| Object program model | `assembler/object_program.hpp` | — |
| Readable `.obj`/`.out` text | `assembler/object_text.hpp` | `Assembler/object_text.cpp` |
| Linker | `assembler/linker.hpp` | `Assembler/linker.cpp` |
| Relocating loader | `assembler/loader.hpp` | `Assembler/loader.cpp` |

## The assembler's side

`CSECT` starts a control section with its own location counter and symbol scope.
`EXTDEF` names symbols other sections may use; `EXTREF` names symbols defined elsewhere.
`ENTRY` works like `START` and marks the file the program starts in. A file ends with one
`END`; its operand (resolved in the file's first section) is the transfer address.

An external symbol can only fill an address field: a format-4 operand (5 half-bytes) or a
`WORD` (6 half-bytes). In format 3 the assembler reports `X is an external reference; use
+JSUB X (format 4)`.

Each section carries Beck's records as data (`ControlSection`):

- **H**: name, start, length.
- **D / R**: `defines` (EXTDEF, section-relative) and `refers` (EXTREF).
- **T**: `text` runs, one per contiguous range of emitted bytes.
- **M**: `mods`. Each record adds or subtracts one term of the field's expression, in
  source order. A label of the section itself is the term `+<section name>`; terms that
  name the section cancel in pairs (`ENDA-LISTA` leaves none). See Beck Fig. 3.9.
- **E**: `transfer`, on the first section only.

`fixedFieldLines` lists the lines whose address field no M record can fix: any SIC memory
instruction, and a format-3 direct address of a relocatable operand.

## The linker

`link(inputs)` returns a `LinkResult`. Beck's pass 1 and pass 2 (Fig. 3.11), writing a
program instead of memory:

1. **Checks over the set of files.** With two or more files exactly one must hold `ENTRY`;
   `END` may name an address only in the entry file; every `START`/`ENTRY` operand must be 0.
2. **Pass 1.** CSADDR starts at 0. Each section is placed at CSADDR, its name and its D symbols
   enter the ESTAB with `CSADDR + address` (an absolute EXTDEF keeps its value), and CSADDR
   grows by the section length. A symbol defined twice is reported at both definitions.
3. **Pass 2.** Each section's text is copied to `CSADDR + address`. For every field, the
   terms of its M records are resolved against the ESTAB and added or subtracted (modulo the
   field width). A symbol that is not in the ESTAB is an `undefined external symbol`.
4. **Net relocation.** Each relative symbol counts +1 when added and −1 when subtracted. A
   net of 0 leaves an absolute field; a net of 1 leaves one record `M addr hb +<program>` for
   the loader; anything else is an error.

The output is one section named after the entry section, plus `origins` (which file and
section each byte range came from), the `estab`, a `trace` (one step per ESTAB row in pass 1,
one per M term in pass 2, with the field before and after) and `fixedFields`.

## The relocating loader

`relocateAndLoad(linked, loadAddress, memorySize)` adds the load address to every field that
the linker left relative, in place, and returns the image with the entry point
(`loadAddress + transfer`, or the load address when no section names one) and a source map in
loaded addresses. It refuses, without writing anything:

- a program that does not fit: the whole length counts, not only the emitted bytes;
- a relocated field that no longer fits its half-bytes;
- any fixed address field at a nonzero load address;
- a nonzero load address for an absolute program (one assembled with a nonzero `START`).

## Verification

`test/test_linker.cpp` and `test/test_assembler.cpp` check the implementation against Beck:

- Fig. 2.15 → 2.17: COPY, RDREC and WRREC assemble to Beck's records.
- Fig. 3.8 → 3.9: PROGA, PROGB and PROGC assemble to Beck's records.
- Fig. 3.10(a): the three programs, linked and loaded at 4000, give Beck's memory contents.

The golden files are in `test/data/`. Beck's literals (`=C'EOF'`, `LTORG`) are written as
labelled `BYTE`s at the pool addresses, which gives the same bytes.
