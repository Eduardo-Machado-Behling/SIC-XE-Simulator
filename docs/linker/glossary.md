# Glossary

| Term | Meaning | Chapter |
|---|---|---|
| absolute value | a value that does not depend on where the program is loaded: a number, a length, a distance between two addresses | 3 |
| allocation | deciding where each control section goes in the linked program | 1, 6 |
| CSADDR | control section address: the counter the linker uses to place the next section | 6 |
| control section | a part of a program with its own location counter from 0 and its own labels; opened by `START`, `ENTRY` or `CSECT` | 4 |
| `CSECT` | opens another control section in the same file | 4 |
| dynamic linking | linking a routine when it is first called; not implemented here | 7 |
| `ENTRY` | this project's version of `START` that also marks the file the program starts in; exactly one per link | 4 |
| entry point | the address where execution starts: load address plus the `E` record's address | 7 |
| ESTAB | external symbol table: every section name and exported symbol, with its address in the linked program | 6 |
| external definition | a label that other sections may use, listed in `EXTDEF` and in the `D` record | 4 |
| external reference | a name defined in another section, listed in `EXTREF` and in the `R` record | 4 |
| fixed field | an address field no M record can fix (format-3 direct, SIC 15-bit, PC-relative to an absolute target); correct only where it was assembled | 3, 7 |
| half-byte | one hex digit, 4 bits; M records measure fields in half-bytes | 3 |
| linkage editor | a linker that writes a linked program to a file, to be loaded later by a relocating loader; what this project uses | 6, 7 |
| linking | resolving each external reference to the address of its definition | 1, 6 |
| linking loader | a loader that links and loads in one go, at every load | 7 |
| load address | where the loader puts the program; the field next to Run; also called PROGADDR | 7 |
| loader | the program that copies the program into memory and sets `PC` | 1, 7 |
| M record | modification record: a field's address, its width in half-bytes, `+` or `-`, and the symbol whose address to add or subtract | 3, 5 |
| net relocation | for one field, +1 per relative name added and −1 per relative name subtracted; 0 absolute, 1 relative, otherwise an error | 3, 6 |
| object program | the assembler's output for one file: `H D R T M E` records per section | 5 |
| origin | which file and section a byte range of the linked program came from; the coloured bands of `.out` | 6, 8 |
| relative value | an address inside the program; it changes when the program moves; also called relocatable | 3 |
| relocating loader | a loader that can put the program at any address by adjusting the fields the M records name | 7 |
| relocation | changing the address fields so the program works at another address | 1, 3 |
| relocation bit mask | Beck's alternative to M records: one bit per word of a `T` record; not used here | 7 |
| revised M record | the M record with a sign and a symbol (Beck §2.3.5), as opposed to the first form that only said "relocate" | 5 |
| target address | the address an instruction finally uses, after applying format 4, PC-relative, base-relative or direct addressing | 2 |
| trace | the list of steps the linker (pass 1, pass 2) and the loader took; the Rastreio tab | 6, 7, 8 |
