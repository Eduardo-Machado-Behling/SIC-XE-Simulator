export const DEFAULT_MAIN_SOURCE = `. SIC/XE syntax tour. A dot in column 1 starts a full-line comment.
SHOWCASE START 0x1000       ; START sets the load address

ENTRY   lda #5              ; mnemonics are case-insensitive; # means immediate
        ADD #3
        STA RESULT           ; labels and instructions share a line
        CLEAR $X              ; register operands always use the $ prefix
        LDX #0
        LDA TABLE,$X          ; indexed addressing uses the SIC/XE index register
        LDA @PTR               ; @ means indirect; # means immediate
        LDA,p TABLE            ; optional ,p forces PC-relative format 3
        BASE TABLE
        LDA,b TABLE            ; optional ,b forces base-relative format 3
        NOBASE
        ADD $A, $S             ; register form selects ADDR (format 2)
        SHIFTL $T,1            ; register plus shift count
        +LDA #0x12345           ; leading + selects format 4 (no ,p or ,b)
        HALT                    ; stop before the data definitions below

TABLE   WORD 1, 2,             ; WORD emits 3-byte values
PTR     WORD TABLE             ; a relocatable symbol can be stored as a WORD
RESULT  RESW 1                 ; reservations occupy addresses but emit no bytes
BUFFER  RESB 8
TEXT    BYTE C'XE', X'F1', 255 ; character, hex, and numeric BYTE forms
`;
