export const DEFAULT_MACRO_SOURCE = `. SIC/XE macro tour. Read it from top to bottom, then press Run.
.
. This tour shows the macro language: a definition, positional and
. keyword parameters, the label parameter, a nested call, unique
. labels with .SER, and a macro whose call defines another macro.
.
. The macro processor runs before the assembler. It reads macro.asm
. once, in one pass, and writes MASMAPRG.ASM: macro.asm without its
. definitions, and with each call replaced by the lines its macro
. produces. The assembler then assembles MASMAPRG.ASM.
.
. To see the result, open macro.asm and press Run.
. - MASMAPRG.ASM opens side by side with macro.asm. Coloured bands
.   link each call of the program below to the lines it produced.
.   MASMAPRG.ASM is read-only: edit macro.asm and run it again. When
.   the Run button reads Stop, press Stop, then Run.
. - The Macros tab, next to CPU and Assembler, has two sub-tabs:
.   Tables (the macros, their definitions and the expansions) and
.   Trace (every line the processor read, one step at a time).
. - Step highlights the running instruction in MASMAPRG.ASM and, in
.   macro.asm, the line it came from (for a line a macro wrote, the
.   call in the program).
.
. Words used below. The prototype line names the macro and its
. formal parameters (formals). A call gives the actual parameters
. (actuals). Each call is an expansion, numbered from 001.
.
. These explanations sit outside the definitions on purpose: a
. comment line inside a macro body is copied into MASMAPRG.ASM at
. every expansion, like the one in the body of SOMA.

. 1. A definition: MCDEFN, the prototype on the next line, the body,
.    then MCEND. MCDEFN and MCEND stand alone on their lines.
.    A definition produces no output. A call becomes a comment line
.    in MASMAPRG.ASM, a dot followed by the call, and then the
.    expanded body.
. 2. Positional formals: SOMA X,Y,Z. The actuals of a call are
.    matched by position: the first goes to X, the second to Y and
.    the third to Z.
. 3. The label formal: L, a name written before the macro name on
.    the prototype line. The label of a call goes where the body
.    writes L, here on the LDA. A macro without parameters cannot
.    have a label formal: L NAME is read as the macro L with the
.    formal NAME. A macro without a label formal puts the label of
.    a call on a line LABEL EQU * before the body.
        MCDEFN
L       SOMA X,Y,Z           ; Z = X + Y
. this line is copied at every expansion of SOMA
L       LDA X
        ADD Y
        STA Z
        MCEND

. 4. A nested call: the body of DOBRA calls SOMA, and passes its own
.    label on. So the label of a DOBRA call lands on the LDA that
.    SOMA writes. The nested call becomes a comment line too, with
.    its actuals already replaced.
        MCDEFN
L       DOBRA V              ; V = 2 * V
L       SOMA V,V,V
        MCEND

. 5. Keyword formals: P=, Q= and R=MAIOR. The text after the = is a
.    default: R defaults to MAIOR, and P and Q have none. A call
.    names its keyword actuals (P=N), so they may come in any order,
.    and an omitted one takes its default. A positional actual goes
.    to a keyword formal too, by position: MAXIMO N,M passes N to P
.    and M to Q.
. 6. .SER makes a label unique to each expansion. FIM.SER becomes
.    FIM followed by the number of the expansion, with at least
.    three digits: FIM003 here, since DOBRA is expansion 001, the
.    SOMA it calls is 002 and MAXIMO is 003. Each call of MAXIMO
.    gets its own label.
        MCDEFN
        MAXIMO P=,Q=,R=MAIOR ; R = max(P, Q)
        LDA P
        COMP Q
        JGT FIM.SER
        LDA Q
FIM.SER STA R
        MCEND

. 7. A nested definition: the body of ESCALA holds the definition of
.    MULTK, so MULTK does not exist until ESCALA is called. The call
.    ESCALA 3 defines MULTK and writes the actual 3 into its body at
.    that moment: MUL #K becomes MUL #3. The call itself emits only
.    its comment line. MULTK can be called from the next line on.
.    A macro cannot be called before its definition has been read.
        MCDEFN
        ESCALA K             ; defines MULTK, which multiplies by K
        MCDEFN
        MULTK A,C            ; C = A * K
        LDA A
        MUL #K
        STA C
        MCEND
        MCEND

. 8. Names and keywords are case-insensitive: MCDEFN, MCEND, macro
.    names, formal names and the keyword of a keyword actual (the Q
.    of Q=M) can be written in any case. So maximo q=M,p=N would call
.    MAXIMO just as the MAXIMO call in the program below does.
.
. The program. MAXIMO gets its keyword actuals in another order
. than its prototype, and R takes its default. After a run to HALT:
. N = 10 (0x00000A), MAIOR = 10 (0x00000A), TRIPLO = 30 (0x00001E).
PROG    START 0x0000
INICIO  DOBRA N              ; N = N + N = 10
        MAXIMO Q=M,P=N       ; MAIOR = max(N, M) = 10
        ESCALA 3             ; defines MULTK with K = 3
        MULTK N,TRIPLO       ; TRIPLO = N * 3 = 30
        HALT
N       WORD 5
M       WORD 7
MAIOR   RESW 1
TRIPLO  RESW 1
        END INICIO

. Not supported:
. - conditional macros (AIF/AGO);
. - parameter concatenation;
. - &SYSLIST;
. - Beck's syntax (MACRO/MEND/&PARAM);
. - the "version 1" prototype INCR MCDEFN L,A: MCDEFN takes no
.   label or operands;
. - the = body marker (slide 20's L= LOAD A=);
. - an actual containing a comma: BUF,$X cannot be passed as one
.   actual;
. - a forward reference to a macro: a call before the definition is
.   copied unchanged, and the assembler judges it.
`;
