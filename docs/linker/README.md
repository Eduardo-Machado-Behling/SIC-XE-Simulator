# Linkers, from zero to this codebase

An onboarding guide for students who have never studied linkers. It starts with why linkers
exist, builds up the ideas one at a time with small SIC/XE examples, and ends with a tour of
how stage 4 of this simulator implements them and how to change it.

It follows Leland Beck, *System Software: An Introduction to Systems Programming*, 3rd
edition: §2.3.5 (control sections), chapter 3 (loaders and linkers). Section numbers in the
text refer to that book.

## Before you start

You should be comfortable with:

- hexadecimal and the idea that memory is an array of bytes with addresses;
- what an assembler does in general: it turns mnemonics and labels into bytes;
- reading short assembly programs. Chapter 2 covers the SIC/XE parts you need.

No prior knowledge of linkers, loaders or object files is assumed.

## Reading order

| # | Chapter | You will be able to | Time |
|---|---|---|---|
| 1 | [Why linkers exist](01-why-linkers.md) | name the four jobs: allocation, linking, relocation, loading | 15 min |
| 2 | [SIC/XE essentials](02-sicxe-essentials.md) | tell which instruction fields hold an address | 20 min |
| 3 | [Relocation](03-relocation.md) | decide whether a field must change when the program moves | 30 min |
| 4 | [Control sections and external symbols](04-control-sections.md) | write a program split across files | 25 min |
| 5 | [The object program](05-object-program.md) | read every record of a `.obj` file | 25 min |
| 6 | [The linker](06-the-linker.md) | run both passes by hand and build an ESTAB | 30 min |
| 7 | [The loader](07-the-loader.md) | follow one field from the assembler to memory | 20 min |
| 8 | [The codebase](08-the-codebase.md) | find the code for each step and trace a Run end to end | 30 min |
| 9 | [Hands-on](09-hands-on.md) | break the tour on purpose and predict each error; write your own linked program | 45 min |
| 10 | [From the lecture to the code](10-the-lecture.md) | translate the lecture's terms (TSG, usage table, relocation bits, kinds of loader) and explain what is not implemented | 25 min |
| 11 | [The presentation, slide by slide](11-the-presentation.md) | present any slide of the stage 4 video and answer the questions on it | 30 min |

The [glossary](glossary.md) defines every term in bold the first time it appears.

Chapters 1 to 7 are about concepts and use this project only for examples. Chapter 8 is the
map of the code. Chapter 10 maps the course lecture's vocabulary onto Beck's and the code's,
and chapter 11 is the long version of the presentation script. If you already know linkers and only need the code, read chapter 8, then
[backend/docs/linker/README.md](../../backend/docs/linker/README.md), the reference for what
is implemented.

## The running example

Every chapter uses the **linker tour**, the three files a new project in the simulator
starts with:

| File | Control sections | What it holds |
|---|---|---|
| `linker/prog.asm` | `PROG` (the entry) | `N`, `M`, `MAIOR`; doubles `N`, calls `MAXIMO`, stores `N * K` in `TRIPLO` |
| `linker/maximo.asm` | `MAXIMO` | a subroutine: `MAIOR = max(N, M)` |
| `linker/dados.asm` | `DADOS`, `TABELA` | `K`, `TRIPLO`, an address (`ENDMAIOR`) and a distance (`DISTANC`) |

The source is in
[frontend/src/lib/simulator/defaultLinkerSources.ts](../../frontend/src/lib/simulator/defaultLinkerSources.ts).
All numbers in this guide (ESTAB, object code, traces, memory) come from linking these files
at load address `1000` in the running simulator.

## Diagrams

Each `.puml` file in [diagrams/](diagrams/) has a rendered `.svg` next to it, and the
chapters show the `.svg`. To re-render after editing a diagram:

```powershell
java -jar plantuml.jar -charset UTF-8 -tsvg docs/linker/diagrams/*.puml
```

The diagrams use PlantUML's built-in `smetana` layout, so Graphviz is not needed. The VS Code
PlantUML extension also previews them.
