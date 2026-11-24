. Beck, System Software, Fig. 3.8: sample programs illustrating linking and relocation,
. in this assembler's syntax. The "." lines of the book are RESB gaps, so every
. statement keeps Beck's address.
PROGC   START   0
        EXTDEF  LISTC,ENDC
        EXTREF  LISTA,ENDA,LISTB,ENDB
        RESB    0x18
REF1   +LDA     LISTA
REF2   +LDT     LISTB+4
REF3   +LDX     #ENDA-LISTA
        RESB    0x0C
LISTC   EQU     *
        RESB    0x12
ENDC    EQU     *
REF4    WORD    ENDA-LISTA+LISTC
REF5    WORD    ENDC-LISTC-10
REF6    WORD    ENDC-LISTC+LISTA-1
REF7    WORD    ENDA-LISTA-(ENDB-LISTB)
REF8    WORD    LISTB-LISTA
        END
