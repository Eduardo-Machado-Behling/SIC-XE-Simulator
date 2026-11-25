# 9. Hands-on

Exercises in the simulator and on paper. Every expected message below was produced by the
simulator; if you see something different, the code has changed and the guide needs an
update.

## Setup

1. Start the backend and the frontend (see the repository README), open
   `http://localhost:3000` and create a project. It comes with the `linker/` tour.
2. In the explorer, switch on `linker/prog.asm`, `linker/maximo.asm` and `linker/dados.asm`
   (the switch at the end of each row). `prog.asm` shows the `ENTRADA` badge.
3. Type `1000` in the field next to Run.

## A. Watch it work

1. Press Run. Open the **Ligador** tab: compare **Tabelas** with the ESTAB in chapter 6, and
   **Rastreio** with the pass 2 and loader traces in chapters 6 and 7.
2. In the pane beside the editor, open `prog.obj`, then `PROG.out`. Find the `+JSUB MAXIMO`
   bytes in each (`4B100000`, then `4B10002F`). Hover a coloured band in `PROG.out`; click
   the green one and see `dados.asm` open at `TABELA  CSECT`.
3. Press Step until `+JSUB MAXIMO` runs: the editor switches to `maximo.asm`. Keep stepping
   to `RSUB` and back to `prog.asm`, then to `HALT`. Check the memory values against
   chapter 7.
4. Change the load address to `0` and Run again. What is the same (ESTAB, `PROG.out`) and
   what changed (memory addresses, the loader trace)? Why?

## B. Break it on purpose

Make one change at a time, predict the message, press Run, then undo the change.

| # | Change | Expected message |
|---|---|---|
| 1 | in `prog.asm`, `+JSUB MAXIMO` → `JSUB MAXIMO` | `linker/prog.asm:43:14: error: MAXIMO is an external reference; use +JSUB MAXIMO (format 4)` |
| 2 | in `prog.asm`, `PROG ENTRY 0` → `PROG START 0` | two errors: `linker/prog.asm:51: error: only the ENTRY file can name a transfer address` and `linker/prog.asm:1: error: no ENTRY in the linked files` |
| 3 | in `dados.asm`, `DADOS START 0` → `DADOS ENTRY 0` | `linker/dados.asm:6: error: a second ENTRY (the first is in linker/prog.asm)` |
| 4 | in `dados.asm`, `WORD MAIOR-N` → `WORD MAIOR+N` | `linker/dados.asm:17: error: relocation of this field is not 0 or 1 (net 2)` |
| 5 | switch off `maximo.asm` | `linker/prog.asm:43: error: undefined external symbol MAXIMO` |
| 6 | a new file `abs.asm` with `ABS START 1000`, `RSUB`, `END ABS`; run it alone at load address `2000` | `an absolute program cannot be relocated; set the load address to 0` |

For each one, say which program found the problem (assembler, linker pass 1, linker pass 2,
loader) and why it could not be found earlier.

## C. On paper

1. The Run command lists the files as `prog.asm`, `maximo.asm`, `dados.asm` instead. Write
   the ESTAB.
2. With that order and load address `1000`, what four bytes does `+JSUB MAXIMO` have in
   memory?
3. Give the net relocation of each `WORD`, as if it were in `TABELA` with
   `EXTREF MAIOR,N,K,TRIPLO`: `WORD MAIOR`, `WORD MAIOR-N`, `WORD TRIPLO-K`, `WORD MAIOR+N`,
   `WORD 100`.
4. Why does `JGT FIM` in `maximo.asm` need no M record, while `+STA MAIOR` on the same line
   as `FIM` needs one?
5. A program has a fixed field and runs at load address 0. Explain why it would break at
   `1000`, using the 12-bit field of format 3.

## D. Write your own

Write two files and link them so that `TOTAL = PARCA + PARCB`:

- `main.asm` is the entry. It defines `PARCA` (2), `PARCB` (3) and `TOTAL` (one reserved
  word), exports them, calls `SOMA` and stops with `HALT`.
- `soma.asm` holds the subroutine `SOMA`: it loads `PARCA`, adds `PARCB`, stores `TOTAL` and
  returns.

Before running, write down the ESTAB and the M records you expect in each `.obj` and in the
`.out`. Then link at `1000` and step to `HALT`.

Careful: `A`, `B`, `X`, `L`, `S`, `T`, `F` are register names and cannot be labels.

## Answers

**A.4.** The ESTAB and `PROG.out` are identical: the linker always works from 0. Memory
starts at 0 instead of `1000`, every relocated field is `1000` smaller, and the loader trace
is empty because nothing moves.

**B.** 1: assembler (format 3 has no room for an unknown address). 2 and 3: linker, before
pass 1 (only the set of files shows how many `ENTRY`s there are). 4: linker, after pass 2
(only then are both terms known to be relative). 5: linker pass 2 (the name was never put in
the ESTAB). 6: loader (only the loader knows the load address).

**C.1.**

| Section | Symbol | Address | Length |
|---|---|---|---|
| `PROG` | | `000000` | `23` |
| | `N`, `M`, `MAIOR` | `1A`, `1D`, `20` | |
| `MAXIMO` | | `000023` | `16` |
| `DADOS` | | `000039` | `6` |
| | `K`, `TRIPLO` | `39`, `3C` | |
| `TABELA` | | `00003F` | `6` |

The total length is still `45`.

**C.2.** `MAXIMO` is at `23`, so `PROG.out` has `4B100023` and memory at `1009` has
`4B 10 10 23`.

**C.3.** 1, 0, 0, 2 (an error), 0.

**C.4.** `JGT FIM` is PC-relative: it holds `FIM - PC`, and both move together. `+STA MAIOR`
holds the address of `MAIOR`, which is external.

**C.5.** A format-3 direct field holds the address itself in 12 bits, at most `FFF`. At
`1000` the relocated address would be `1000` or more, which does not fit in 12 bits, so no
modification can make the field right. Format 4 has 20 bits and can.

**D.** One solution:

```text
MAIN    ENTRY 0                      SOMA    START 0
        EXTDEF PARCA,PARCB,TOTAL             EXTREF PARCA,PARCB,TOTAL
        EXTREF SOMA                         +LDA PARCA
INICIO +JSUB SOMA                           +ADD PARCB
        HALT                                +STA TOTAL
PARCA   WORD 2                               RSUB
PARCB   WORD 3                               END
TOTAL   RESW 1
        END INICIO
```

ESTAB: `MAIN = 0` (length `0E`), `PARCA = 05`, `PARCB = 08`, `TOTAL = 0B`, `SOMA = 0E`
(length `0F`).

- `main.obj` has `M 000001 05 +SOMA`.
- `soma.obj` has `M 000001 05 +PARCA`, `M 000005 05 +PARCB` and `M 000009 05 +TOTAL`.
- `MAIN.out` has four `M … +MAIN` records, at `000001`, `00000F`, `000013` and `000017`.

At `HALT`, memory at `100B` holds `000005`.

Back to the [index](README.md). Terms: [glossary](glossary.md).
