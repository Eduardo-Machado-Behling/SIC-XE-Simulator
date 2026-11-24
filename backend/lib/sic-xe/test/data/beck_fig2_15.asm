. Beck, System Software, Fig. 2.15: control sections and program linking, in this
. assembler's syntax. Differences from the book, none of which change the bytes:
.   - register operands carry the $ prefix (CLEAR $X, COMPR $A,$S, BUFFER,$X);
.   - the literals =C'EOF' and =X'05' (and LTORG) are labelled BYTEs placed where
.     Beck's literal pools sit, so every address and displacement is the same.
COPY    START   0
        EXTDEF  BUFFER,BUFEND,LENGTH
        EXTREF  RDREC,WRREC
FIRST   STL     RETADR
CLOOP  +JSUB    RDREC
        LDA     LENGTH
        COMP    #0
        JEQ     ENDFIL
       +JSUB    WRREC
        J       CLOOP
ENDFIL  LDA     EOFLIT
        STA     BUFFER
        LDA     #3
        STA     LENGTH
       +JSUB    WRREC
        J       @RETADR
RETADR  RESW    1
LENGTH  RESW    1
EOFLIT  BYTE    C'EOF'
BUFFER  RESB    4096
BUFEND  EQU     *
MAXLEN  EQU     BUFEND-BUFFER

RDREC   CSECT
        EXTREF  BUFFER,LENGTH,BUFEND
        CLEAR   $X
        CLEAR   $A
        CLEAR   $S
        LDT     MAXLEN
RLOOP   TD      INPUT
        JEQ     RLOOP
        RD      INPUT
        COMPR   $A,$S
        JEQ     EXIT
       +STCH    BUFFER,$X
        TIXR    $T
        JLT     RLOOP
EXIT   +STX     LENGTH
        RSUB
INPUT   BYTE    X'F1'
MAXLEN  WORD    BUFEND-BUFFER

WRREC   CSECT
        EXTREF  LENGTH,BUFFER
        CLEAR   $X
       +LDT     LENGTH
WLOOP   TD      WRLIT
        JEQ     WLOOP
       +LDCH    BUFFER,$X
        WD      WRLIT
        TIXR    $T
        JLT     WLOOP
        RSUB
WRLIT   BYTE    X'05'
        END     FIRST
