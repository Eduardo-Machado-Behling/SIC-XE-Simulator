// The linker tour of a new project: the macro tour's program, split across three files
// that the linker joins (Beck's control sections: ENTRY/START, CSECT, EXTDEF, EXTREF).

export const DEFAULT_LINKER_PROG = `. SIC/XE linker tour, 1 of 3: the entry file. Read it, then link it.
.
. This program is the macro tour's, split across three files:
. - linker/prog.asm (this file) holds N, M and MAIOR, doubles N
.   with the macro DOBRA, and computes TRIPLO = N * K;
. - linker/maximo.asm is the subroutine MAXIMO: MAIOR = max(N, M);
. - linker/dados.asm holds K and TRIPLO, and two words that show
.   how the linker treats an address and a distance.
.
. To link them, switch on the three files in the explorer (the
. switch on each row) and press Run. Type a load address next to
. Run, 1000 for example: the loader puts the program there.
. - The pane beside the editor shows MASMAPRG.ASM, this file's
.   object program (prog.obj) and the linked program (PROG.out),
.   with one coloured band per control section.
. - The Linker tab, next to Macros, shows the external symbol
.   table (ESTAB) and every step of pass 1, pass 2 and the loader.
. - Step follows the program into maximo.asm and back.
.
. After a run to HALT: N = 10 (0x00000A), MAIOR = 10 (0x00000A),
. TRIPLO = 30 (0x00001E), and in dados.asm DISTANC = 6 and
. ENDMAIOR = the address MAIOR was loaded at.
.
. ENTRY works like START and marks the file the program starts in:
. exactly one of the linked files has it. END INICIO, here only,
. names the first instruction. A section's name (PROG) is an
. external symbol without EXTDEF.
PROG    ENTRY 0
        EXTDEF N,M,MAIOR      ; usable by the other files
        EXTREF MAXIMO,K,TRIPLO ; defined in the other files

. A macro is expanded in the file that defines it, before linking.
        MCDEFN
L       DOBRA V               ; V = 2 * V
L       LDA V
        ADD V
        STA V
        MCEND

INICIO  DOBRA N               ; N = N + N = 10
. An external symbol fills an address field, so it needs format 4
. (+). Remove the + below to see the assembler say so.
       +JSUB MAXIMO           ; MAIOR = max(N, M) = 10
       +LDA N
       +MUL K                 ; K = 3, in dados.asm
       +STA TRIPLO            ; TRIPLO = N * K = 30, in dados.asm
        HALT
N       WORD 5
M       WORD 7
MAIOR   RESW 1
        END INICIO
`;

export const DEFAULT_LINKER_MAXIMO = `. SIC/XE linker tour, 2 of 3: a subroutine in its own file.
.
. MAXIMO stores the larger of N and M in MAIOR. All three live in
. prog.asm, so they are EXTREF here, and each use is format 4: the
. assembler leaves the address 0 and a modification record that
. the linker fills from the ESTAB. FIM is local: PC-relative, and
. never relocated.
. A subroutine's END names no address: only the ENTRY file does.
MAXIMO  START 0
        EXTREF N,M,MAIOR
       +LDA N
       +COMP M
        JGT FIM
       +LDA M
FIM    +STA MAIOR
        RSUB
        END
`;

export const DEFAULT_LINKER_DADOS = `. SIC/XE linker tour, 3 of 3: two control sections in one file.
.
. CSECT starts a new section with its own location counter, from
. 0. Each section has its own EXTDEF and EXTREF, and the linker
. places one after the other. One END closes the file.
DADOS   START 0
        EXTDEF K,TRIPLO
K       WORD 3
TRIPLO  RESW 1

. A word that holds an address (one + record) stays relocatable:
. the loader adds the load address to it. A distance between two
. addresses (a + and a - record) cancels: nothing to relocate.
TABELA  CSECT
        EXTREF MAIOR,N
ENDMAIOR WORD MAIOR            ; the loaded address of MAIOR
DISTANC WORD MAIOR-N           ; 6, wherever the program is loaded
        END
`;
