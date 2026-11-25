# Roteiro · Etapa 4, Ligador

Slides: [etapa4-ligador.html](etapa4-ligador.html) (ou o PDF ao lado).
Sete pessoas, cerca de 11 minutos. O texto de cada parte tem por volta de 200 palavras, o que dá 1 min 30 s em ritmo de fala calmo. Não precisa decorar: as frases servem de guia e os números estão nos slides.

| Ordem | Quem | Slides | Tempo |
|---|---|---|---|
| 1 | Pedro | 1, 2 | 1:30 |
| 2 | Eduardo | 3, 4 | 1:45 |
| 3 | Agatha | 5, 6 | 1:45 |
| 4 | Felipe | 7 | 1:15 |
| 5 | Mauricio | 8, 9 | 1:45 |
| 6 | Henrique | 10, 11 | 1:45 |
| 7 | Diogo | 12, 13 | 1:30 |
| | | | **11:15** |

---

## 1. Pedro · slides 1 e 2 (1:30)

**Slide 1.** Boa tarde. Nós somos o grupo do simulador SIC/XE e hoje apresentamos a Etapa 4, o ligador.

O quadro à direita é o resultado que vamos explicar: um programa ligado, o PROG.out, feito de três arquivos. Cada cor é uma seção de controle, e o rótulo diz de qual arquivo ela veio.

**Slide 2.** Na Etapa 3 o simulador montava um arquivo por vez. Agora ele monta vários, cada um com as suas seções, junta tudo num programa só e carrega esse programa no endereço que o usuário escolher. Seguimos o modelo do Beck, capítulo 3.

As diretivas novas estão na tabela. START abre a primeira seção de um arquivo e CSECT abre outra no mesmo arquivo. EXTDEF diz o que uma seção oferece e EXTREF, o que ela usa de fora. A ENTRY é nossa: funciona como START e marca o arquivo onde o programa começa. Tem de haver exatamente uma.

O exemplo da apresentação tem três arquivos. prog.asm é o principal, maximo.asm é uma sub-rotina e dados.asm tem duas seções, DADOS e TABELA. O Eduardo mostra como esses arquivos passam pelo simulador.

---

## 2. Eduardo · slides 3 e 4 (1:45)

**Slide 3.** O caminho tem cinco passos. Cada arquivo passa sozinho pelo processador de macros e pelo montador, como na etapa passada, e o montador gera o programa objeto daquele arquivo, o .obj.

Depois vem o ligador. Ele coloca o arquivo com ENTRY primeiro, os outros na ordem do comando, e resolve os nomes que um arquivo usa de outro. O resultado é o PROG.out, um programa só, ainda contando a partir do zero. Por último o carregador soma o endereço de carga e grava a memória.

À direita está o comando que o botão Run manda pelo WebSocket: o endereço depois da arroba e um arquivo depois de cada sinal de porcentagem. Com um arquivo só e endereço zero, o caminho é o mesmo e o resultado também é o da Etapa 3.

**Slide 4.** No código isso é a função load_files. Para cada arquivo ela chama o processador de macros e o montador. Depois chama link e relocateAndLoad, emite o evento ProgramLinked e só então confere se houve erro.

Essa ordem é proposital: mesmo com erro, a interface recebe o que foi ligado até ali. O load_file antigo agora chama load_files com um arquivo, então não há dois caminhos para manter. A Agatha explica o que o montador entrega para o ligador.

---

## 3. Agatha · slides 5 e 6 (1:45)

**Slide 5.** O montador entrega um ObjectProgram, que é uma lista de seções de controle. Cada campo da seção corresponde a um registro do Beck: o nome, o início e o tamanho vão no H, os nomes exportados no D, os importados no R, o código no T, as correções no M e o endereço inicial no E.

O ModRecord é o registro M revisado, com sinal e símbolo, como no capítulo 3. O ligador devolve um LinkResult com a ESTAB, o rastreio e as faixas coloridas do .out. O carregador devolve a imagem da memória e um mapa de endereço para arquivo e linha, que é o que o Step usa.

O texto do .obj é desenhado a partir dessa estrutura e nunca é lido de volta.

**Slide 6.** Este é o prog.obj. O H diz que a seção PROG tem 23 bytes em hexadecimal. O D exporta N, M e MAIOR, e o R importa MAXIMO, K e TRIPLO. As linhas com ponto mostram de qual instrução vem cada grupo de bytes.

Olhem as duas linhas destacadas. O +JSUB MAXIMO foi montado com zero, porque MAXIMO está em outro arquivo, e o M +MAXIMO pede ao ligador que some esse endereço. O +LDA N já tem o endereço de N, mas o M +PROG avisa que esse valor depende de onde a seção ficar. Um nome externo exige o formato 4; sem o mais, o montador recusa. O Felipe mostra a primeira passagem do ligador.

---

## 4. Felipe · slide 7 (1:15)

**Slide 7.** A primeira passagem monta a ESTAB, a tabela de símbolos externos. O algoritmo está à esquerda. Um contador, o CSADDR, começa em zero. Para cada seção, o ligador anota o nome dela com o CSADDR atual, anota cada nome do registro D somando o CSADDR e avança o contador pelo tamanho da seção.

Na tabela dá para seguir isso. PROG começa em zero e tem 23 bytes, então DADOS começa em 23. DADOS tem 6, então TABELA começa em 29, e MAXIMO em 2F. K, que estava no endereço zero da seção DADOS, fica em 23 no programa ligado.

Dois detalhes. O endereço de carga não aparece aqui: o ligador sempre trabalha a partir do zero e quem soma o endereço é o carregador. E o nome da seção também entra na tabela, mesmo sem EXTDEF; é isso que faz o M +PROG funcionar.

Os erros desta passagem são nome definido duas vezes, duas ENTRY, nenhuma ENTRY ou um START diferente de zero com vários arquivos. O Mauricio continua com a segunda passagem.

---

## 5. Mauricio · slides 8 e 9 (1:45)

**Slide 8.** Na segunda passagem o ligador lê cada registro M, procura o símbolo na ESTAB e soma ou subtrai o endereço no campo. A tabela mostra antes e depois. O +MAXIMO em 00000A passa de zero para 2F, que é onde MAXIMO ficou.

As duas linhas em laranja são a mesma palavra, DISTANC, que vale MAIOR menos N. Primeiro soma MAIOR, depois subtrai N, e sobra 6.

Depois disso o ligador conta a relocação líquida de cada campo. Se for 1, o campo é um endereço e ganha um M +PROG no .out. Se for zero, como em MAIOR menos N, é uma distância e não precisa de mais nada. Qualquer outro valor é erro.

**Slide 9.** O carregador faz a parte final. No .out todos os registros M já são +PROG, porque os nomes externos foram resolvidos. O carregador soma o endereço de carga a cada um deles.

O quadro segue um campo do começo ao fim: 4B100000 no .obj, 4B10002F depois do ligador e 4B10102F depois do carregador, em 1009 na memória. À direita estão os nove campos que ele moveu. O DISTANC não aparece, porque a relocação dele é zero. Com endereço zero nada se move. O Henrique mostra como isso aparece na tela.

---

## 6. Henrique · slides 10 e 11 (1:45)

**Slide 10.** Esta é a tela do editor. No explorador, cada arquivo tem uma chave que diz se ele entra na ligação, e o selo ENTRADA marca o arquivo com ENTRY. O botão Run mostra quantos arquivos vão ser ligados e, ao lado, fica o endereço de carga, que por padrão é zero.

O painel da direita tem três abas: MASMAPRG.ASM, o .obj do arquivo aberto e o .out. No .out cada seção tem uma cor. Passando o mouse aparece de onde a seção veio e onde foi carregada. Clicando, o editor abre o arquivo da seção e acende a linha do START ou do CSECT, como aqui com TABELA.

**Slide 11.** A aba Ligador tem duas partes. Tabelas mostra o endereço de carga e a ESTAB. Rastreio lista as duas passagens e o carregador. Clicar num passo abre o arquivo dele e mostra o .obj ou o .out ao lado.

O Step também conhece os arquivos. No +JSUB MAXIMO, o editor troca para maximo.asm; no RSUB, volta para prog.asm. O .obj e o .out ganharam destaque de sintaxe próprio, com uma cor para cada parte do registro. O Diogo fecha com os erros e os testes.

---

## 7. Diogo · slides 12 e 13 (1:30)

**Slide 12.** A tabela mostra o que o simulador recusa, com a mensagem de cada caso. Nome externo sem formato 4, nenhuma ou duas ENTRY, nome que ninguém define, relocação líquida diferente de 0 e 1, e programa absoluto carregado fora do zero.

O último caso merece atenção: o campo fixo. É um endereço que nenhum registro M consegue corrigir, como uma instrução SIC ou um formato 3 com endereço direto de um rótulo relocável. Ele está certo só onde foi montado. Na primeira seção, carregada em zero, funciona. Em outro lugar, o simulador recusa e aponta a linha, em vez de rodar com o endereço errado.

**Slide 13.** No fim da execução, com o programa carregado em 1000, a memória fica assim: N e MAIOR valem 10 e TRIPLO vale 30. ENDMAIOR guarda 1020, o endereço onde MAIOR foi parar, e DISTANC continua 6.

Os testes: 23 do ligador e do carregador, usando as figuras do Beck como dados, 148 da API, um deles rodando este exemplo até o HALT, e 276 do frontend.

Era isso. Obrigado, e ficamos à disposição para perguntas.
