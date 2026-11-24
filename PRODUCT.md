# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, served equally:

- **Students learning SIC/XE** in a systems-programming course. They write SIC/XE assembly, run it, and step through it to see how the assembler, macro processor, loader and machine behave.
- **The professor grading the course stages.** Each stage is a deliverable; the evaluator checks that the stage's required behavior works and can be seen in the interface.

The team building it is six students (see README.md), who also use it to present each stage, for example in the stage 3 demo video.

## Product Purpose

A browser-based SIC/XE simulator that makes every step from source to execution visible: macro expansion, two-pass assembly, loading, and instruction-by-instruction execution. Success means a student can follow what the machine did and why, and a grader can verify each stage's requirements from the running app.

## Positioning

One processor class per stage serves the editor, the server and the command-line tool, so what the editor shows, what runs, and what `sicxe_macro` writes to disk never disagree. The intermediate artifacts that textbook processors only describe (MASMAPRG.ASM, the macro tables, the one-pass trace with its `d` and `e` columns) are first-class, inspectable views linked back to the source.

## Operating Context

- Built stage by stage for one course run (stage 3, "Etapa 3", is the macro processor). It is not planned to outlive the course.
- Syntax and algorithms follow the course slides (Calingaert): `MCDEFN`/`MCEND` macros, the one-pass algorithm of figures 4.5, 4.11 and 4.18, and the trace of figure 4.12, reproduced by an automated test.
- Used during class work, grading and recorded stage presentations (videos with a script per team member).
- Deployed publicly on Render's free plan: a Next.js web service and a C++ engine service (`render.yaml`).

## Capabilities and Constraints

- Projects live in the browser (localStorage) and are mirrored to a server session so the simulator can load them; new projects ship with `main.asm` and a commented `macro.asm` tour.
- Editor with language-server diagnostics, completion, definition, references and rename; a terminal with `run`, `step`, `reset`, `clear machine`; register, memory and symbol views.
- Run assembles the open file. With macros, it writes a read-only, generated `MASMAPRG.ASM` next to the source, with coloured bands linking each call to its expansion, plus a Macros view with Tables (names, definitions, expansions) and a Trace with Normal / Definition / Expansion modes.
- A source starting with `;` loads as a hexadecimal memory dump.
- Command-line tool `sicxe_macro` writes `MASMAPRG.ASM` to disk, as the stage 3 assignment requires.
- Terminology to keep: MCDEFN, MCEND, prototype, formal and actual parameters, `.SER`, serial, expansion, MASMAPRG.ASM, name table, definition table, `d` and `e`.
- **Interface language: English and Portuguese (pt-BR), switchable.** Today only English exists; the switch is an open decision to build. Code, mnemonics and assembler syntax stay as written in either language.
- Each stage's required behavior must stay visible and exact; later work must not hide or change it.

## Brand Commitments

- Name: SIC/XE Simulator.
- No logo, mark or visual identity exists yet. The page metadata still carries the Create Next App defaults, and `frontend/public/` holds only framework placeholder icons.

## Evidence on Hand

- Demo programs: `backend/lib/sic-xe/test/data/macro_demo.asm` and the default `macro.asm` / `main.asm` sources in `frontend/src/lib/simulator/`.
- Documentation: `backend/docs/` (macro processor, assembler, protocol, language server) and UML diagrams in `backend/docs/uml/`.
- Automated tests, including the figure 4.12 trace reproduction.
- No user testimonials, usage data, or external endorsements exist; do not invent any.

## Product Principles

1. **Faithful to the course.** Syntax, algorithms and names match the course material; correctness beats convenience.
2. **Show the work.** Every intermediate artifact a stage produces is visible and traceable back to the source line that caused it.
3. **One source of truth.** The editor, the server and the CLI share the same processor code, so no view can disagree with another.
4. **Gradable at a glance.** A stage's required behavior should be demonstrable from the running app without reading code.
