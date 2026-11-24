. Beck, System Software, Fig. 3.8: sample programs illustrating linking and relocation,
. in this assembler's syntax. The "." lines of the book are RESB gaps, so every
. statement keeps Beck's address.
PROGB   START   0
        EXTDEF  LISTB,ENDB
        EXTREF  LISTA,ENDA,LISTC,ENDC
        RESB    0x36
REF1   +LDA     LISTA
REF2    LDT     LISTB+4
REF3   +LDX     #ENDA-LISTA
        RESB    0x1F
LISTB   EQU     *
        RESB    0x10
ENDB    EQU     *
REF4    WORD    ENDA-LISTA+LISTC
REF5    WORD    ENDC-LISTC-10
REF6    WORD    ENDC-LISTC+LISTA-1
REF7    WORD    ENDA-LISTA-(ENDB-LISTB)
REF8    WORD    LISTB-LISTA
        END
