# Assembler to CPU Compatibility Report

**Reviewed:** 2026-10-20  
**Scope:** SIC/XE assembler output, loading into the SIC/XE simulator, instruction decoding, and execution.

## Verdict

The default SIC/XE assembler output is compatible with the simulator for the instruction subset exercised end to end. The complete assembler and CPU are **not compatible**: the assembler accepts encodings that the CPU cannot execute, SIC-mode output is not decoded as SIC, some format-2 operands accepted by the assembler fail against the 48-bit `F` register, and the CPU's fixed four-byte fetch prevents execution of instructions at the end of memory.

The loader preserves `CodeMemory` segment addresses by writing the image at base address zero. It initializes PC from the assembler's `END` operand (or the `START` address by default). A program assembled for its declared absolute addresses therefore loads at the matching addresses in the current simulator.

## Verification performed

### Existing CTest suite

`ctest --test-dir build --output-on-failure` completed with **21/21 tests passing**. The tests cover sparse `CodeMemory`, all assembler opcode encodings, formats 1 through 4, addressing encodings, directives, expressions, the SIC assembler mode, and diagnostics.

These are primarily assembler tests. They do not establish that every encoded instruction is implemented by the CPU.

The 21 passing test names were:

1. `code-memory.sparse-segment-merging`
2. `assembly.example-program-encoding`
3. `instructions.format-1-and-format-2-encoding`
4. `instructions.all-format-1-opcodes`
5. `instructions.all-format-2-operands`
6. `instructions.all-memory-opcodes`
7. `instructions.halt-extension-encoding`
8. `addressing.base-relative-and-direct`
9. `addressing.pc-relative-boundaries`
10. `addressing.format-4-and-immediate-values`
11. `addressing.indirect-and-indexed-rules`
12. `directives.data-and-expression-encoding`
13. `parser.case-insensitive-source`
14. `directives.org-sparse-memory-segments`
15. `image.start-entry-and-reserved-gaps`
16. `modes.sic-compatibility`
17. `diagnostics.mnemonics-and-operands`
18. `diagnostics.registers-and-formats`
19. `diagnostics.symbols-and-directives`
20. `diagnostics.exception-details`
21. `metadata.entry-point-listing-and-warnings`

### Assembler-to-CPU integration checks

I loaded assembled source through the running backend's WebSocket `load` / `step` path and checked decoded instructions plus register and memory write events. Seven programs passed:

| Case | Program behavior checked | Result |
|---|---|---|
| Arithmetic and store | `LDA #5`, `ADD #3`, `SUB #1`, `MUL #2`, `DIV #3`, `STA`, `HALT`; A reached 4 and memory received `00 00 04` | Pass |
| Nonzero start and entry | `START 0x100`, `END ENTRY`; load initialized PC to `0x103`, and the first step executed the entry instruction there | Pass |
| Indexed, indirect, and store | `LDX`, `LDA VALUE-1,X`, `STA RESULT`, `LDA @PTR`; both loads produced `0x010203` and the store wrote to `RESULT` | Pass |
| Format 4 and base-relative | `+LDB #4096`, `BASE FAR`, `LDA FAR`; B became `0x1000` and A became `0xABCDEF` | Pass |
| Format-2 register operations | `CLEAR`, `ADDR`, `RMO`, `SHIFTL`; X became 7 and S became 14 | Pass |
| Conditional branch | `COMP #5` followed by `JEQ`; control reached the expected label and A became 9 | Pass |
| Subroutine control flow | `JSUB`, `LDA`, `RSUB`, `HALT`; L received the return address and RSUB restored PC | Pass |

The integration checks used the existing `bin/api.exe` and architecture DLLs. A fresh `cmake --build build` attempt did not complete: Ninja remained at `Re-checking globbed directories...` for more than a minute, so I stopped that build. The run is therefore evidence about the binaries currently in `bin`, not proof that a fresh build of every current source file succeeds.

## Coverage matrix

| Area | Test cases represented | Status and limit |
|---|---|---|
| Sparse image representation | Separate `ORG` segments, bridging segments, reserved gaps | Pass in CTest; not by itself a CPU execution check |
| Absolute load addresses | `START 0x100`, entry at a later label, discontiguous `ORG` segment | Nonzero entry verified end to end; second segment placement covered by assembler tests |
| Format 1 encoding | `FIX`, `FLOAT`, `HALT`, `HIO`, `NORM`, `SIO`, `TIO` | Encodings pass; several operations are not executable (see below) |
| Format 2 encoding | `ADDR`, `CLEAR`, `COMPR`, `DIVR`, `MULR`, `RMO`, `SHIFTL`, `SHIFTR`, `SUBR`, `SVC`, `TIXR` | Encodings pass; only a subset was executed end to end |
| Format 3/4 opcode encoding | Every memory-format mnemonic in the assembler table | All opcode encodings pass; this does not imply instruction bodies exist |
| Immediate addressing | Small constants, format-4 constant, 12-bit and 20-bit range rejection | Encoding and range checks pass; small and format-4 values executed |
| PC-relative addressing | Forward and backward displacement limits, branches, data references | Encoding boundaries pass; branch and data references executed |
| Base-relative addressing | `BASE`, a target outside PC-relative range, displacement from B | Encoding and one execution case pass |
| Indexed addressing | `target,X`, including index addition to the resolved address | Encoding and one execution case pass |
| Indirect addressing | `@pointer` reads an address then loads through it | Encoding and one execution case pass |
| Data directives | `BYTE`, `WORD`, character/hex literals, signed values, expressions | Assembler output checks pass; indirect pointer/data load was executed |
| Control flow | `J`, conditions, `JSUB`/`RSUB`, `HALT` | Conditional branch and subroutine path pass; not every branch condition has an execution test |
| Register width | Standard 24-bit registers and six-byte F register | A/B/S/X paths exercised; format-2 operations involving F are a known gap |
| Error paths | Invalid mnemonic, operands, ranges, symbols, reservations, overlap | Assembler diagnostics tests pass; runtime exceptions are not covered by those tests |
| SIC encoding mode | SIC 15-bit address format | Assembler encoding tests pass; output is not compatible with the SIC/XE decoder |
| Memory boundary | Instruction beginning at the final byte of 1 MiB | Assembler accepts the image, but CPU fetch is four bytes and fails at runtime |

### Additional CPU-level regression cases needed for exhaustive coverage

These are follow-up cases, not tests claimed as passing in this review. Each row expands to multiple tests where boundary values are listed.

| Case | Input / scenario | Expected assertion |
|---|---|---|
| Arithmetic signs and wrap | `ADD`, `SUB`, `MUL` with positive, negative, maximum-positive, and minimum-negative 24-bit values | A matches signed 24-bit arithmetic and wraps to 24 bits |
| Division boundaries | `DIV` with positive and negative operands; divisor 0 | Quotient follows the chosen signed rule; zero divisor reports the documented runtime error |
| Bitwise operations | `AND` / `OR` with alternating-bit and all-zero/all-one words | A contains the expected 24-bit bitwise result |
| Compare condition codes | `COMP` / `COMPR` for less-than, equal, and greater-than values | SW condition-code bits match each comparison |
| Conditional branches | `JEQ`, `JGT`, `JLT`, each taken and not taken | PC lands on the target only for its matching condition |
| Unconditional jump modes | `J` using PC-relative, base-relative, indirect, and format-4 targets | PC lands on the resolved target |
| All register loads | `LDA`, `LDB`, `LDL`, `LDS`, `LDT`, `LDX` using immediate and memory operands | Each named register receives the exact 24-bit value |
| All register stores | `STA`, `STB`, `STL`, `STS`, `STT`, `STX` | Memory receives exactly three big-endian bytes from the selected register |
| Character operations | `LDCH` and `STCH` at several byte positions | LDCH preserves the other A bytes; STCH changes only one memory byte |
| TIX comparisons | `TIX` / `TIXR` below, equal to, and above the comparison operand | X increments once and SW reflects the post-increment comparison |
| Format-2 arithmetic | `DIVR`, `MULR`, and `SUBR` with each supported 24-bit register pair | The specified destination register gets the expected value |
| Format-2 compare and move | `COMPR` and `RMO` with same-width registers and width-conversion cases | CC and copied/truncated/padded bytes follow the documented rules |
| Shift boundaries | `SHIFTL` / `SHIFTR` by 1 and 16, on positive and negative values | Result matches the SIC/XE shift and sign-extension rules |
| PC-relative runtime edges | Forward `+2047` and backward `-2048` references; one step beyond each | Boundary values resolve correctly; assembler rejects out-of-range cases |
| Base-relative runtime edges | Base displacement 0 and 4095; target one byte outside range | Valid targets resolve; invalid encoding is rejected by assembly |
| Immediate boundaries | `#0`, `#4095`, `+#4096`, and the maximum format-4 value | Immediate values are not mistaken for memory reads and retain the intended width |
| Indexed address arithmetic | X = 0, positive, negative, and near its 24-bit wrap boundary | Effective address equals target plus X using the defined address width |
| Indirect pointer bounds | Pointer at the last valid word and pointer whose three bytes exceed memory | Valid pointer dereferences; invalid read raises a bounds error without partial mutation |
| Sparse segments at runtime | Branch from one `ORG` segment to a second; read data across reserved gaps | Loader places both segments at their absolute addresses and zero-filled gaps behave consistently |
| End-of-memory execution | One-byte `HALT` at `0xFFFFF`; three- and four-byte instructions at the highest valid starts | Each instruction that fits memory can be fetched and executed |
| Assembler/runtime capability parity | One executable test per accepted mnemonic, including `SVC` and all currently unimplemented bodies | Every accepted mnemonic either executes or is rejected by assembly with a clear diagnostic |
| SIC-mode isolation | SIC `LDA` at addresses below and above `0x0FFF`, with and without indexing | SIC bytes are rejected by SIC/XE mode or decoded by a dedicated SIC mode |
| F-register validation | `CLEAR F`, `RMO F,A`, `COMPR F,A`, arithmetic and shifts involving F | Accepted combinations execute with 48-bit semantics; unsupported combinations fail during assembly |

## Concrete incompatibilities

### 1. The assembler accepts instructions without CPU execution support

The assembler defines 60 mnemonics. The CPU instruction table has entries for all except `SVC`; among the entries that exist, 20 implementations explicitly throw `UnimplementedInstruction`:

- Floating point: `ADDF`, `COMPF`, `DIVF`, `LDF`, `MULF`, `SUBF`.
- Processor/system operations: `FIX`, `FLOAT`, `HIO`, `LPS`, `NORM`, `SIO`, `TIO`.
- Device or memory-control operations: `RD`, `SSK`, `STF`, `STI`, `STSW`, `TD`, `WD`.
- `SVC` is encoded by the assembler as format 2, but its CPU description is commented out. The decoder reports an unknown opcode for it.

Thus a successful assembly is not a guarantee that the resulting program can run to completion. For example, `SVC 3` assembles, while the CPU has no `SVC` decode entry. `ADDF VALUE` assembles and decodes, then reaches an explicit unimplemented body.

### 2. SIC-mode output is not SIC/XE CPU input

`AssemblerOptions{.mode = ArchMode::Sic}` emits the SIC layout: a 15-bit address and an optional index bit. The CPU decoder always interprets bytes as SIC/XE format 3/4, including `b`, `p`, and `e` flags and a 12-bit displacement. For example, SIC `LDA 0x1234` can emit `00 12 34`; bit 4 of the second byte is then read as the SIC/XE `e` flag, so the decoder selects format 4 and consumes a fourth byte. The simulator currently exposes a SIC/XE architecture, not a SIC decoder.

### 3. The assembler accepts F-register combinations that CPU word helpers reject

The parser maps `F` to register number 6 for format-2 operands. Several CPU implementations then call `Word::from_bytes`, which requires exactly three bytes, while F is allocated as six bytes. For example, `COMPR F,A`, `ADDR F,A`, or `SHIFTL F,1` can be assembled but fail at execution when the CPU reads F as a `Word`. Either the assembler must reject unsupported register combinations or the execution code must implement the correct register width and operation semantics.

### 4. The last memory byte can be assembled but not fetched

The assembler permits a one-byte instruction at address `0xFFFFF` in the 1 MiB XE address space. `SICXE::step()` always fetches four bytes (`address_width = 4`), even for format-1 instructions. A step at `0xFFFFF` therefore fails the memory bounds check before decoding the valid one-byte instruction.

## Recommended compatibility contract

1. Define one shared capability table for assembler-accepted mnemonics, supported formats, operand schemas, and executable implementations.
2. Until instruction bodies exist, make the assembler reject those mnemonics for the executable SIC/XE target, or expose an explicit “encodable but not executable” mode.
3. Keep SIC-mode assembly separate from SIC/XE execution, or add a decoder mode that parses SIC's 15-bit address and index layout.
4. Validate format-2 register combinations against register width and instruction semantics during assembly.
5. Fetch the opcode first, determine the required instruction length, then fetch only the remaining bytes. This also allows valid instructions at the upper memory boundary.
6. Add an integration test target that assembles source, loads the resulting `CodeMemory`, steps the CPU, and checks architectural state. Keep byte-encoding tests as a separate suite.

## Bottom line

The assembler and CPU agree on the tested default SIC/XE encodings and the tested execution paths, including loading at a nonzero entry point. They are not a complete matched pair today. The main blockers are accepted-but-unimplemented instructions, missing `SVC` decoding, SIC-mode decoding, F-register format-2 operands, and the fixed-width fetch at the memory boundary.
