# Importação e exportação de cardápio (CSV)

Migre o cardápio de outra plataforma, faça backup ou edite em planilha e importe de volta. Os dados viajam em **arquivos CSV (UTF-8)** dentro de um **pacote ZIP**, com um manifesto. Nada é apagado por uma importação.

Menu do painel: **Cardápio › Importar e exportar** (somente administrador).

## Exportar
1. Abra **Importar e exportar**.
2. Escolha **Cardápio inteiro** ou **Só categorias selecionadas**.
3. Opcionalmente marque **Incluir estoque** (insumos e ficha técnica) e/ou desmarque **Incluir as imagens enviadas**.
4. Clique em **Baixar pacote (.zip)**.

O pacote contém `manifesto.json` (versão do formato, data, loja, escopo, arquivos e quantidade de registros), os CSVs e, se houver, a pasta `imagens/`. Para ver o formato com dados de exemplo, use **Baixar um modelo de exemplo** (os mesmos arquivos estão na pasta `exemplos/` do projeto).

## Importar
1. Em **Importar**, escolha um ou vários arquivos (`.csv` soltos ou um `.zip`).
2. (Opcional) Informe a **plataforma de origem**, por exemplo `zapermenu`. Ela ajuda a reconhecer os mesmos produtos em importações futuras.
3. Escolha **o que fazer**: inserir novos e atualizar os existentes (padrão), só inserir ou só atualizar.
4. Escolha o que fazer quando **já existir um item de mesmo nome sem vínculo**: *usar o existente e atualizá-lo* (padrão), *criar um novo mesmo assim* ou *ignorar*.
5. Clique em **Analisar (simulação)**. Nada é gravado. Você vê o resumo por tipo de registro (novos, atualizados, sem alteração, ignorados), a prévia dos registros com as diferenças campo a campo, os avisos e os **erros com arquivo, linha e coluna**.
6. Corrija os erros e analise de novo. Sem erros, clique em **Confirmar importação**. Se mudar arquivos ou opções depois de analisar, é preciso analisar outra vez.

A gravação é **tudo ou nada** (uma única transação): se houver qualquer erro, nada é importado. O resultado fica no **Histórico de importações**.

## Como os registros são reconhecidos (sem duplicar)
1. Pacote exportado por **esta própria loja**: pelo número dentro do identificador (`prod_12` é o produto 12).
2. Pelos **vínculos** guardados em importações anteriores, usando `id_externo` (id da plataforma de origem) ou o identificador do arquivo (`produto_id`, `categoria_id`...), sempre dentro da mesma plataforma de origem.
3. Pelo **nome** (categorias, etapas e insumos; produtos por nome + categoria; opções por nome dentro da etapa), conforme a opção de duplicidade escolhida. A prévia avisa "vinculado pelo nome".

Depois da primeira importação, o vínculo é gravado: importar de novo o mesmo arquivo não cria nada novo.

## Arquivos do pacote
Status de cada informação: **[confirmado]** = visto no cadastro da plataforma de origem; **[proposto]** = modelagem nossa; **[a confirmar]** = depende de novas informações da plataforma de origem.

| Arquivo | Conteúdo | Obrigatório |
|---|---|---|
| `manifesto.json` | formato `cardapio-csv`, versão `1.0`, data, loja, escopo, arquivos | não (recomendado) |
| `categorias.csv` | categorias | não |
| `produtos.csv` | produtos | não |
| `etapas.csv` | grupos de seleção (adicionais, combo...) | não |
| `produto_etapas.csv` | quais etapas cada produto usa, com limites e ordem próprios | não |
| `opcoes.csv` | escolhas dentro de cada etapa | não |
| `imagens.csv` + `imagens/` | imagens dos produtos | não |
| `disponibilidade.csv` | dias e horários de venda | não |
| `estoque.csv` | insumos | não |
| `ficha_tecnica.csv` | insumos consumidos por produto | não |

Pode enviar só alguns arquivos (por exemplo, só `produtos.csv` para atualizar preços). A ordem de gravação é sempre: categorias, insumos, etapas, produtos, opções, ligações, disponibilidade, ficha técnica e imagens.

### categorias.csv
`categoria_id`\*, `id_externo`, `nome`\*, `descricao`, `ordem_exibicao`, `disponivel`

### produtos.csv
`produto_id`\*, `id_externo`, `nome`\*, `categoria_id`, `descricao`, `preco`, `preco_antigo`, `preco_a_partir_de`, `custo`, `disponivel`, `exibir_cardapio_digital`, `exibir_tablet`, `troca_por_pontos`, `imagem_arquivo`, `tipo_venda`, `ordem_exibicao`, `tipo_disponibilidade`

- `preco` é obrigatório para produto **novo**.
- **[confirmado]**: nome, categoria, descrição, preço, preço antigo, preço a partir de, custo, disponibilidade, exibir no digital, exibir no tablet, troca por pontos, imagem, ordem.
- **[proposto]**: `tipo_venda` (padrão `unitaria`) e `tipo_disponibilidade` (`sempre` ou `agendada`).

**Preço antigo.** Aqui um produto tem *preço* e *preço promocional*. Na importação: se `preco_antigo` for maior que `preco`, o **preço normal vira o preço antigo** e o **preço de venda vira o promocional**. Na exportação acontece o inverso (`preco` = preço de venda; `preco_antigo` = preço normal quando há promoção). Se `preco` vier sem `preco_antigo`, a promoção do produto é removida.

### etapas.csv
`etapa_id`\*, `id_externo`, `nome`\*, `quantidade_minima`, `quantidade_maxima`, `tipo_selecao`, `obrigatoria`, `ordem_exibicao`, `disponivel`

- `tipo_selecao`: `unica` (máximo 1) ou `multipla`. `obrigatoria=true` exige mínimo 1 (ajustado com aviso). O mínimo prevalece sobre `obrigatoria`.
- **[confirmado]**: nome e limites (exemplo: "Transforme seu pedido em combo" e "Adicionais", 0 a 10). **[proposto]**: `tipo_selecao`, `obrigatoria`.

### produto_etapas.csv
`produto_id`\*, `etapa_id`\*, `ordem_exibicao`, `quantidade_minima`, `quantidade_maxima`, `disponivel`

Os limites **por produto prevalecem** sobre os da etapa e valem no cardápio. Valores iguais aos da etapa não viram ajuste (ficam em branco). Editar o produto no painel não apaga esses ajustes.

### opcoes.csv
`opcao_id`\*, `id_externo`, `etapa_id`\*, `produto_referenciado_id`, `nome`\*, `descricao`, `preco_adicional`, `custo_adicional`, `disponivel`, `ordem_exibicao`, `quantidade_minima`, `quantidade_maxima`

- **[a confirmar]**: a estrutura interna das opções na plataforma de origem. Esta é uma **proposta**.
- Uma opção pode referenciar outro produto (`produto_referenciado_id`). **Cobra-se o `preco_adicional`**, não o preço do produto referenciado.
- `quantidade_minima/maxima` por opção são guardadas e exportadas, mas **ainda não são aplicadas** (a escolha no cardápio é por marcação, sem quantidade por opção).

### imagens.csv e pasta imagens/
`imagem_id`, `produto_id`\*, `nome_arquivo`, `caminho_arquivo`, `url_original`, `texto_alternativo`, `ordem_exibicao`

- Use `nome_arquivo` (arquivo dentro de `imagens/` no ZIP; JPG, PNG ou WebP, até 2 MB) **ou** `url_original` (endereço `http(s)` público). **Não se baixam imagens de outros sites automaticamente.**
- O produto tem uma imagem: havendo várias linhas, vale a de menor `ordem_exibicao`.
- Também é possível informar o arquivo direto em `produtos.csv` (`imagem_arquivo`).
- **[a confirmar]**: se a plataforma de origem permite exportar as imagens. Quando não permite, use URLs públicas ou envie as fotos separadamente.

### disponibilidade.csv
`produto_id`\*, `dia_semana`\*, `hora_inicio`\*, `hora_fim`\*

- `dia_semana`: 0 (domingo) a 6 (sábado) ou `dom`, `seg`, `ter`, `qua`, `qui`, `sex`, `sab`. Horários `HH:MM`; várias faixas por dia são permitidas.
- Os horários dos produtos que aparecem no arquivo são **substituídos** pelos do arquivo.
- **[proposto]**. **Estado atual: os horários são guardados e exportados, mas ainda não restringem o cardápio.** Fuso e exceções por data/feriado não estão implementados ([a confirmar] na plataforma de origem).

### estoque.csv (insumos) e ficha_tecnica.csv
`insumo_id`\*, `id_externo`, `nome`\*, `categoria_insumo`, `unidade_medida`\*, `quantidade_estoque`, `estoque_minimo`, `custo_unitario`, `disponivel`

`produto_id`\*, `insumo_id`\*, `quantidade_por_unidade`\*, `unidade_medida`\*, `perda_percentual`, `observacao`

- Unidades aceitas: `kg`, `g`, `L`, `ml`, `unidade` (aceita também `un`, `litros`...). Na ficha, a unidade precisa ser da mesma grandeza do insumo (g e kg; ml e L).
- **O saldo físico só é definido quando o insumo é criado.** Importar um insumo que já existe **não altera o saldo** (aparece um aviso). Entradas, saídas e ajustes são feitos à parte.
- A descrição do produto **não** vira ficha técnica: o consumo de cada ingrediente precisa ser cadastrado ou importado.
- Os insumos aparecem em **Estoque › Insumos**. **O consumo automático dos insumos pelos pedidos ainda não existe.**
- **[proposto]** (a especificação não fixa as regras da plataforma de origem).

\* = coluna obrigatória no cabeçalho.

## Regras de leitura
- **UTF-8**; separador vírgula (detecta também `;` e tabulação, comuns no Excel em português). Aspas, vírgulas e quebras de linha dentro do texto funcionam (use `""` para uma aspa dentro do texto).
- **Campo vazio = valor ausente**: na atualização, o valor atual é mantido (não vira zero nem `false`). Em registro novo valem os padrões (disponível = true, exibir = true, troca por pontos = false...).
- Booleanos: `true`/`false` (aceita também `1`/`0`, `sim`/`não`). Números com **ponto decimal** (`17.00`); `17,50` é aceito e convertido, com aviso. Preços com mais de 2 casas ou negativos são erro.
- Células iniciadas por `=`, `+`, `-` ou `@` recebem um apóstrofo na exportação (proteção contra fórmulas) e o apóstrofo é removido na importação.
- Colunas desconhecidas são ignoradas com aviso. Cada arquivo precisa ter as colunas obrigatórias no cabeçalho.
- Identificadores devem ser únicos por arquivo. As referências (`categoria_id`, `etapa_id`...) apontam para identificadores do pacote ou de importações anteriores.

## O que o cardápio passa a respeitar
- `exibir_cardapio_digital = false`: some do cardápio do cliente (a equipe ainda vende pelo painel).
- Etapa ou ligação **indisponível**: some do cardápio e as opções dela não são aceitas nos pedidos.
- Limites por produto (`produto_etapas`) e ordem das etapas e opções.
- `preco_a_partir_de`: o cardápio mostra "a partir de R$ ...". `custo` nunca aparece para o cliente.
- Guardados sem efeito visível por enquanto: `exibir_tablet`, `troca_por_pontos`, `tipo_venda`, horários, quantidades por opção.

## Limites
Até 12 arquivos por envio, 4 MB por arquivo (a hospedagem serverless limita o corpo da requisição a cerca de 4,5 MB), 5.000 linhas por arquivo, 2 MB por imagem. Para catálogos grandes (centenas de produtos) ou muitas imagens, importe em lotes (por categoria) ou use URLs de imagem. O tempo de gravação depende da latência do banco.

## Erros comuns
| Mensagem | O que fazer |
|---|---|
| o arquivo não está em UTF-8 | na planilha, "Salvar como" → **CSV UTF-8** |
| número de colunas diferente do cabeçalho | um texto com vírgula precisa estar entre aspas; confira a linha indicada |
| coluna obrigatória ausente no cabeçalho | falta a coluna (veja a tabela do arquivo) |
| referência "X" não encontrada | o identificador aponta para algo que não está no pacote nem foi importado antes: inclua o arquivo ou corrija o id |
| identificador duplicado | o mesmo id aparece em duas linhas |
| valor numérico inválido | use ponto decimal e só números |
| unidade incompatível / não é possível trocar a unidade | veja "estoque" acima |
| versão do formato não suportada | o manifesto indica uma versão de formato mais nova que a desta instalação |

## Para desenvolvedores
Endpoints (administrador, com sessão e CSRF): `GET /api/io/export?categorias=1,2&estoque=1&imagens=0`, `GET /api/io/modelo`, `POST /api/io/import` (multipart: `files`, `modo=simular|aplicar`, `acao`, `duplicatas`, `sistema_origem`), `GET /api/io/runs`, `GET /api/ingredients`. Código: `src/services/catalog-export.service.js`, `catalog-import.service.js`, `src/utils/csvio.js`, `catalog-format.js`, migração `src/migrations/006-catalog-import.js`. Testes: `npm run test:csv`, `test:io`, `test:io2`, `test:ui-io`, `test:migrate`.
