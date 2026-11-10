. Demo do processador de macros
        MCDEFN
L       SOMA X,Y,Z           ; Z = X + Y
L       LDA X
        ADD Y
        STA Z
        MCEND
        MCDEFN
L       DOBRA V              ; V = 2 * V   (chamada aninhada de SOMA)
L       SOMA V,V,V
        MCEND
        MCDEFN
        MAXIMO P=,Q=,R=MAIOR ; R = max(P, Q)   (palavra-chave com padrao e .SER)
        LDA P
        COMP Q
        JGT FIM.SER
        LDA Q
FIM.SER STA R
        MCEND
        MCDEFN
        ESCALA K             ; define MULTK com a constante K   (definicao aninhada)
        MCDEFN
        MULTK A,C            ; C = A * K
        LDA A
        MUL #K
        STA C
        MCEND
        MCEND
PROG    START 0x0000
INICIO  DOBRA N              ; N = 10
        MAXIMO P=N,Q=M       ; MAIOR = 10
        ESCALA 3             ; cria MULTK com K = 3
        MULTK N,TRIPLO       ; TRIPLO = 30
        HALT
N       WORD 5
M       WORD 7
MAIOR   RESW 1
TRIPLO  RESW 1
        END INICIO
