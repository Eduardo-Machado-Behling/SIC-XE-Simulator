# Roteiro do vídeo · Etapa 4, Ligador

Slides: [etapa4-ligador.html](etapa4-ligador.html) (ou o PDF ao lado). A versão anterior, com sete falas seguidas sobre os slides, está na tag git `etapa4-apresentacao-v1`.

O enunciado pede um vídeo de no máximo 10 minutos, com 5 de tolerância, com todo o grupo. O vídeo tem de mostrar a interação entre os componentes e a arguição do funcionamento, e não pode ser só slides nem só falas individuais. Por isso:

- cada seção tem um dono, que fala e mexe no simulador;
- no fim de cada seção, quem vem a seguir faz uma pergunta e o dono responde (está no texto, em **Pergunta**);
- a maior parte do tempo é o simulador rodando; os slides entram para explicar o que acabou de aparecer.

Meta: 9 minutos. O texto tem cerca de 1.250 palavras, contando os rótulos; o resto do tempo são cliques.

| Ordem | Dono | Na tela | Pergunta de | Tempo |
|---|---|---|---|---|
| 1 | Pedro | slides 1 a 3 | Eduardo | 1:30 |
| 2 | Eduardo | slides 4 e 5, simulador | Agatha | 1:15 |
| 3 | Agatha | simulador, slide 6 | Felipe | 1:15 |
| 4 | Felipe | simulador, slide 7 | Mauricio | 1:15 |
| 5 | Mauricio | simulador, slide 8 | Henrique | 1:15 |
| 6 | Henrique | simulador, slide 9 | Diogo | 1:15 |
| 7 | Diogo | simulador, slides 10 a 12 | Pedro | 1:30 |
| | | | | **9:15** |

## Antes de gravar

- Backend e frontend rodando, projeto aberto na pasta `linker`, com as chaves de `prog.asm`, `maximo.asm` e `dados.asm` ligadas e o endereço de carga em 0.
- Tela em 1920×1080 e zoom do navegador em 125%, para os registros do .obj serem legíveis no vídeo.
- Uma chamada com todos e a tela compartilhada, gravada de uma vez. Quem fala liga a câmera. Se for gravar por partes, cada parte começa na pergunta da seção anterior, para o corte ficar natural.
- Se o simulador travar no meio de uma seção, pare, reinicie e grave a seção de novo a partir da pergunta anterior.

---

## 1. Pedro · slides 1 a 3

**Slide 1.** Oi. Nós somos o grupo do simulador SIC/XE e este é o vídeo da Etapa 4, o ligador. À direita está o resultado: o PROG.out, ligado a partir de três arquivos, com uma cor por seção.

**Slide 2.** Até a Etapa 3 o simulador montava um arquivo por vez. Agora ele monta vários, liga todos num programa só e carrega esse programa no endereço que o usuário escolher. As diretivas são as do Beck, capítulo 3: START e CSECT abrem seções, EXTDEF diz o que a seção oferece e EXTREF o que ela usa de fora. A ENTRY é nossa e marca o arquivo principal.

**Slide 3.** Este slide liga a aula ao código. A tabela de definições virou o registro D. A tabela de uso virou o registro R mais o registro M revisado, que guarda endereço do campo, tamanho, sinal e símbolo. A tabela de símbolos globais, a TSG, é a ESTAB. Bits ou mapa de relocação nós não usamos: o registro M já aponta cada campo que precisa ser corrigido. Do enunciado, fizemos a variante de apenas um ligador: ele junta tudo a partir do zero e o carregador relocador termina a relocação.

**Pergunta. Eduardo:** Se não tem bit de relocação, o que acontece com um programa SIC?

**Pedro:** Ele não se move. Uma instrução SIC tem o endereço direto e nenhum registro M para ela, então só roda onde foi montada. O simulador avisa em vez de rodar errado; o Diogo mostra isso no fim.

---

## 2. Eduardo · slides 4 e 5, simulador

**Slide 4.** O caminho é este. Cada arquivo passa pelo processador de macros e pelo montador, como na etapa passada, e sai um .obj por arquivo. O ligador junta os .obj num PROG.out, ainda contando do zero, e o carregador soma o endereço de carga e grava a memória.

**Slide 5.** A partir daqui, cada um mostra uma parte no simulador. *(troca para o simulador)*

**Simulador.** Aqui estão os três arquivos. A chave ao lado de cada um diz se ele entra na ligação, e o selo ENTRADA marca o prog.asm, que tem a ENTRY. Vou carregar em 1000. *(digita 1000 ao lado do Executar)* O botão mostra quantos arquivos vão ser ligados: três. *(clica em Executar)* À direita apareceram três abas: o MASMAPRG.ASM, o .obj do arquivo aberto e o PROG.out.

**Pergunta. Agatha:** O ligador recebe os arquivos em que ordem?

**Eduardo:** O arquivo com ENTRY vai primeiro, porque é ele que fica no endereço zero do programa ligado. Os outros vão na ordem do comando que o Run manda.

---

## 3. Agatha · simulador, slide 6

**Simulador.** *(abre a aba prog.obj)* Este é o programa objeto do prog.asm. O H diz que a seção PROG tem 23 bytes, em hexa. O D exporta N, M e MAIOR, com o endereço de cada um dentro da seção, e o R importa MAXIMO, K e TRIPLO.

Lá embaixo estão os registros M. O primeiro é +MAXIMO: é o +JSUB MAXIMO. O montador não sabe onde MAXIMO vai ficar, então monta zero e pede ao ligador que some o endereço. O seguinte, +PROG, é do +LDA N. Ali o endereço de N já está no campo, mas só vale depois que a seção ganhar um lugar.

Agora tiro o mais do JSUB. *(apaga o + na linha 43 e clica em Executar)* O montador recusa: "MAXIMO is an external reference; use +JSUB MAXIMO (format 4)". *(põe o + de volta e executa de novo)*

**Slide 6.** O slide mostra o mesmo .obj, com as duas linhas M destacadas.

**Pergunta. Felipe:** Por que o formato 3 não serve para um nome externo?

**Agatha:** No formato 3 o campo é uma distância a partir do PC, e a distância até outro arquivo o montador não conhece. O formato 4 guarda o endereço inteiro, e um registro M consegue corrigir.

---

## 4. Felipe · simulador, slide 7

**Simulador.** *(abre a aba Ligador, Tabelas)* Esta é a ESTAB que a primeira passagem montou.

**Slide 7.** O algoritmo está à esquerda. Um contador, o CSADDR, começa em zero. Para cada seção, o nome dela entra na tabela com o CSADDR atual, cada nome do registro D entra somado ao CSADDR, e o contador avança pelo tamanho da seção. É a passagem 1 da aula: a primeira tabela de definições entra sem mudança, e as outras entram somadas ao tamanho do que veio antes.

Na tabela: PROG começa em zero e tem 23 bytes, então DADOS começa em 23. DADOS tem 6, então TABELA começa em 29, e MAXIMO em 2F. K, que estava no zero da seção DADOS, fica em 23.

**Pergunta. Mauricio:** O endereço de carga é 1000. Por que a ESTAB começa em zero?

**Felipe:** Porque o ligador sempre trabalha a partir do zero. Quem soma o 1000 é o carregador, no fim. Assim o mesmo PROG.out serve para qualquer endereço.

---

## 5. Mauricio · simulador, slide 8

**Simulador.** *(abre Rastreio)* A segunda passagem está no rastreio. Ela lê cada registro M, pega o endereço do símbolo na ESTAB e soma ou subtrai no campo. *(clica no passo +MAXIMO)* O clique abre a linha do fonte e mostra o .obj ao lado. O +MAXIMO em 00000A passou de zero para 2F, que é onde MAXIMO ficou.

**Slide 8.** As duas linhas em laranja são o mesmo campo, o WORD MAIOR-N da seção TABELA. Primeiro soma MAIOR, depois subtrai N, e sobra 6. Depois disso o ligador conta a relocação líquida de cada campo: mais um para cada nome relativo somado, menos um para cada subtraído. Se der 1, o campo é um endereço e ganha um M +PROG no PROG.out. Se der zero, é uma distância. Outro valor é erro.

**Pergunta. Henrique:** E o MAIOR menos N, dá quanto?

**Mauricio:** Zero: um mais, um menos. É uma distância, vale 6 em qualquer endereço de carga, e o carregador não mexe nele.

---

## 6. Henrique · simulador, slide 9

**Simulador.** *(abre a aba PROG.out)* No PROG.out cada seção tem uma faixa colorida. *(passa o mouse na faixa verde)* O mouse mostra de onde ela veio: dados.asm, seção TABELA, carregada de 1029 a 102E. *(clica)* O clique abre o arquivo na linha do CSECT.

*(clica em Passo até o +JSUB MAXIMO, depois mais uma vez)* No +JSUB MAXIMO o editor troca para maximo.asm. *(segue até o RSUB e clica)* No RSUB volta para prog.asm. Ele sabe de que arquivo é cada endereço porque o carregador guarda esse mapa.

**Slide 9.** No PROG.out todos os M são +PROG, porque os nomes externos já foram resolvidos. O quadro segue o +JSUB MAXIMO do começo ao fim: 4B100000 no .obj, 4B10002F depois do ligador e 4B10102F depois do carregador, gravado em 1009. À direita estão os nove campos que o carregador moveu.

**Pergunta. Diogo:** E se o endereço de carga for zero?

**Henrique:** Nada se move. O rastreio do carregador fica vazio e a memória sai igual ao PROG.out.

---

## 7. Diogo · simulador, slides 10 a 12

**Simulador.** E se faltar um arquivo? *(desliga a chave do maximo.asm e clica em Executar)* "undefined external symbol MAXIMO", no prog.asm, linha 43, que é a do JSUB. *(religa a chave e executa)*

**Slide 10.** Os outros erros estão aqui, cada um com a mensagem. O mais estranho é o campo fixo: um endereço que nenhum registro M consegue corrigir, como uma instrução SIC ou um formato 3 com endereço direto de um rótulo. Na primeira seção, carregada em zero, funciona. Em outro lugar o simulador recusa e aponta a linha, em vez de rodar com o endereço errado.

**Slide 11.** Carregado em 1000, o programa termina com N e MAIOR valendo 10 e TRIPLO valendo 30. ENDMAIOR guarda 1020, onde MAIOR foi parar, e DISTANC continua 6. Os testes estão no slide: as figuras do Beck são dados de teste do ligador, e um teste da API roda este exemplo até o HALT.

**Pergunta. Pedro:** O Beck acha o programa principal pelo operando do END. Por que nós usamos ENTRY?

**Diogo:** *(slide 12)* No editor os arquivos são chaves ligadas ou desligadas, sem ordem, e o ligador precisa saber qual vai no zero antes da primeira passagem. Isso importa por causa do campo fixo. O END com operando continua valendo, só que no arquivo com ENTRY. O custo é que a figura 3.8 do Beck precisa de ENTRY no lugar do START do PROGA.

Era isso. Obrigado.

---

## Para a arguição

Perguntas que o professor pode fazer, com o dono que responde.

| Dono | Pergunta | Resposta curta |
|---|---|---|
| Pedro | Qual variante do enunciado vocês fizeram? | Apenas um ligador: o PROG.out sai relativo a 0 e o carregador relocador termina a relocação na carga. |
| Eduardo | Um arquivo só ainda funciona como na Etapa 3? | Sim. `load_file` chama `load_files` com um arquivo e endereço 0; não existe outro caminho. |
| Agatha | O ligador lê o texto do .obj? | Não. O montador entrega a estrutura `ObjectProgram`; o .obj é só a forma legível dela. |
| Felipe | O que acontece com um nome definido em duas seções? | Erro de nome duplicado na passagem 1, apontando a linha de início de cada seção. |
| Mauricio | O que é relocação líquida 2? | Dois nomes relativos somados, como `WORD MAIOR+N`. Nenhum endereço de carga deixa o campo certo, então é erro. |
| Henrique | Como o Step sabe trocar de arquivo? | O carregador devolve um mapa de endereço para arquivo e linha (`sourceMap`). |
| Diogo | O que é um campo fixo? | Um campo de endereço sem registro M possível, como uma instrução SIC. Só funciona onde foi montado; fora disso o simulador recusa. |
