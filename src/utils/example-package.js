// Pacote de exemplo (modelo) com dados fictícios e válidos: serve de guia para montar um CSV e para testes.
const AdmZip = require('adm-zip');
const { PNG } = require('pngjs');
const { toCsv } = require('./csvio');
const F = require('./catalog-format');

function placeholderPng() {
  const png = new PNG({ width: 64, height: 64 });
  for (let i = 0; i < 64 * 64; i++) { png.data[i * 4] = 232; png.data[i * 4 + 1] = 185; png.data[i * 4 + 2] = 49; png.data[i * 4 + 3] = 255; }
  return PNG.sync.write(png);
}

const T = {
  categorias: [
    { categoria_id: 'cat_001', id_externo: 'orig_cat_01', nome: 'Lanches', descricao: 'Lanches da casa', ordem_exibicao: 1, disponivel: true },
    { categoria_id: 'cat_002', id_externo: 'orig_cat_02', nome: 'Bebidas', descricao: null, ordem_exibicao: 2, disponivel: true },
    { categoria_id: 'cat_003', id_externo: 'orig_cat_03', nome: 'Porções', descricao: null, ordem_exibicao: 3, disponivel: true },
  ],
  produtos: [
    { produto_id: 'prod_001', id_externo: 'orig_123', nome: 'Misto Quente', categoria_id: 'cat_001', descricao: 'Mussarela, Cheddar, Presunto, Catchup. Maionese da Casa', preco: '17.00', preco_antigo: null, preco_a_partir_de: null, custo: null, disponivel: true, exibir_cardapio_digital: true, exibir_tablet: true, troca_por_pontos: false, imagem_arquivo: null, tipo_venda: 'unitaria', ordem_exibicao: 1, tipo_disponibilidade: 'sempre' },
    { produto_id: 'prod_002', id_externo: 'orig_124', nome: 'X-Burger "Especial"', categoria_id: 'cat_001', descricao: 'Pão, hambúrguer 150 g, queijo e salada.\nServido com molho da casa, ao gosto.', preco: '22.00', preco_antigo: '24.00', preco_a_partir_de: null, custo: '9.50', disponivel: true, exibir_cardapio_digital: true, exibir_tablet: true, troca_por_pontos: false, imagem_arquivo: null, tipo_venda: 'unitaria', ordem_exibicao: 2, tipo_disponibilidade: 'sempre' },
    { produto_id: 'prod_003', id_externo: 'orig_125', nome: 'Refrigerante lata', categoria_id: 'cat_002', descricao: '350 ml', preco: '6.00', preco_antigo: null, preco_a_partir_de: null, custo: '2.80', disponivel: true, exibir_cardapio_digital: true, exibir_tablet: true, troca_por_pontos: true, imagem_arquivo: 'refrigerante.png', tipo_venda: 'unitaria', ordem_exibicao: 1, tipo_disponibilidade: 'sempre' },
    { produto_id: 'prod_004', id_externo: 'orig_126', nome: 'Batata frita', categoria_id: 'cat_003', descricao: 'Porção de 300 g, crocante', preco: '18.90', preco_antigo: null, preco_a_partir_de: '18.90', custo: null, disponivel: true, exibir_cardapio_digital: true, exibir_tablet: false, troca_por_pontos: false, imagem_arquivo: null, tipo_venda: 'unitaria', ordem_exibicao: 1, tipo_disponibilidade: 'agendada' },
    { produto_id: 'prod_005', id_externo: 'orig_127', nome: 'Suco de laranja', categoria_id: 'cat_002', descricao: 'Natural, sem açúcar', preco: '8.00', preco_antigo: null, preco_a_partir_de: null, custo: null, disponivel: false, exibir_cardapio_digital: true, exibir_tablet: true, troca_por_pontos: false, imagem_arquivo: null, tipo_venda: 'unitaria', ordem_exibicao: 2, tipo_disponibilidade: 'sempre' },
  ],
  etapas: [
    { etapa_id: 'etapa_001', id_externo: 'orig_etapa_01', nome: 'Transforme seu pedido em combo', quantidade_minima: 0, quantidade_maxima: 10, tipo_selecao: 'multipla', obrigatoria: false, ordem_exibicao: 1, disponivel: true },
    { etapa_id: 'etapa_002', id_externo: 'orig_etapa_02', nome: 'Adicionais', quantidade_minima: 0, quantidade_maxima: 10, tipo_selecao: 'multipla', obrigatoria: false, ordem_exibicao: 2, disponivel: true },
    { etapa_id: 'etapa_003', id_externo: 'orig_etapa_03', nome: 'Ponto da carne', quantidade_minima: 1, quantidade_maxima: 1, tipo_selecao: 'unica', obrigatoria: true, ordem_exibicao: 3, disponivel: true },
  ],
  produto_etapas: [
    { produto_id: 'prod_001', etapa_id: 'etapa_001', ordem_exibicao: 1, quantidade_minima: 0, quantidade_maxima: 10, disponivel: true },
    { produto_id: 'prod_001', etapa_id: 'etapa_002', ordem_exibicao: 2, quantidade_minima: 0, quantidade_maxima: 10, disponivel: true },
    { produto_id: 'prod_002', etapa_id: 'etapa_003', ordem_exibicao: 1, quantidade_minima: 1, quantidade_maxima: 1, disponivel: true },
    { produto_id: 'prod_002', etapa_id: 'etapa_002', ordem_exibicao: 2, quantidade_minima: 0, quantidade_maxima: 3, disponivel: true },
  ],
  opcoes: [
    { opcao_id: 'opcao_001', id_externo: 'orig_op_01', etapa_id: 'etapa_002', produto_referenciado_id: null, nome: 'Bacon', descricao: null, preco_adicional: '3.00', custo_adicional: '1.20', disponivel: true, ordem_exibicao: 1, quantidade_minima: 0, quantidade_maxima: 10 },
    { opcao_id: 'opcao_002', id_externo: 'orig_op_02', etapa_id: 'etapa_002', produto_referenciado_id: null, nome: 'Ovo', descricao: null, preco_adicional: '2.50', custo_adicional: null, disponivel: true, ordem_exibicao: 2, quantidade_minima: 0, quantidade_maxima: 10 },
    { opcao_id: 'opcao_003', id_externo: 'orig_op_03', etapa_id: 'etapa_002', produto_referenciado_id: null, nome: 'Queijo extra', descricao: 'Mussarela fatiada', preco_adicional: '3.50', custo_adicional: null, disponivel: true, ordem_exibicao: 3, quantidade_minima: 0, quantidade_maxima: 10 },
    { opcao_id: 'opcao_004', id_externo: 'orig_op_04', etapa_id: 'etapa_001', produto_referenciado_id: 'prod_003', nome: 'Refrigerante lata', descricao: null, preco_adicional: '5.00', custo_adicional: null, disponivel: true, ordem_exibicao: 1, quantidade_minima: 0, quantidade_maxima: 1 },
    { opcao_id: 'opcao_005', id_externo: 'orig_op_05', etapa_id: 'etapa_001', produto_referenciado_id: 'prod_004', nome: 'Batata frita', descricao: null, preco_adicional: '10.00', custo_adicional: null, disponivel: true, ordem_exibicao: 2, quantidade_minima: 0, quantidade_maxima: 1 },
    { opcao_id: 'opcao_006', id_externo: 'orig_op_06', etapa_id: 'etapa_003', produto_referenciado_id: null, nome: 'Ao ponto', descricao: null, preco_adicional: '0.00', custo_adicional: null, disponivel: true, ordem_exibicao: 1, quantidade_minima: null, quantidade_maxima: null },
    { opcao_id: 'opcao_007', id_externo: 'orig_op_07', etapa_id: 'etapa_003', produto_referenciado_id: null, nome: 'Bem passado', descricao: null, preco_adicional: '0.00', custo_adicional: null, disponivel: true, ordem_exibicao: 2, quantidade_minima: null, quantidade_maxima: null },
  ],
  imagens: [{ imagem_id: 'img_003', produto_id: 'prod_003', nome_arquivo: 'refrigerante.png', caminho_arquivo: 'imagens/refrigerante.png', url_original: null, texto_alternativo: 'Refrigerante em lata', ordem_exibicao: 1 }],
  disponibilidade: [1, 2, 3, 4, 5].flatMap((d) => [{ produto_id: 'prod_004', dia_semana: d, hora_inicio: '11:00', hora_fim: '15:00' }, { produto_id: 'prod_004', dia_semana: d, hora_inicio: '18:00', hora_fim: '23:00' }]).concat([{ produto_id: 'prod_004', dia_semana: 6, hora_inicio: '18:00', hora_fim: '23:00' }]),
  insumos: [
    { insumo_id: 'insumo_001', id_externo: null, nome: 'Pão de hambúrguer', categoria_insumo: 'Padaria', unidade_medida: 'unidade', quantidade_estoque: 40, estoque_minimo: 10, custo_unitario: 0.9, disponivel: true },
    { insumo_id: 'insumo_002', id_externo: null, nome: 'Carne moída', categoria_insumo: 'Açougue', unidade_medida: 'kg', quantidade_estoque: 12.5, estoque_minimo: 3, custo_unitario: 38, disponivel: true },
    { insumo_id: 'insumo_003', id_externo: null, nome: 'Queijo mussarela', categoria_insumo: 'Frios', unidade_medida: 'kg', quantidade_estoque: 8, estoque_minimo: 2, custo_unitario: 42, disponivel: true },
  ],
  ficha_tecnica: [
    { produto_id: 'prod_002', insumo_id: 'insumo_001', quantidade_por_unidade: 1, unidade_medida: 'unidade', perda_percentual: 0, observacao: null },
    { produto_id: 'prod_002', insumo_id: 'insumo_002', quantidade_por_unidade: 150, unidade_medida: 'g', perda_percentual: 5, observacao: 'Exemplo ilustrativo: não representa uma receita real' },
    { produto_id: 'prod_001', insumo_id: 'insumo_003', quantidade_por_unidade: 0.05, unidade_medida: 'kg', perda_percentual: 0, observacao: null },
  ],
};

function exampleFiles() {
  const files = {};
  for (const entity of F.ORDER) files[F.FILES[entity].file] = Buffer.from(toCsv(F.FILES[entity].columns, T[entity]), 'utf8');
  const manifest = { formato: F.FORMAT, versao: F.VERSION, exportado_em: '2026-01-01T00:00:00.000Z', sistema_origem: 'exemplo', loja: { nome: 'Lanchonete Exemplo', slug: 'exemplo' }, escopo: { tipo: 'tudo', categorias: [] }, inclui_estoque: true, inclui_imagens: true, imagens: 1, arquivos: F.ORDER.map((e) => ({ nome: F.FILES[e].file, registros: T[e].length })), avisos: ['Pacote de exemplo com dados fictícios.'] };
  files['manifesto.json'] = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
  return files;
}

function exampleZip() {
  const zip = new AdmZip();
  for (const [name, buf] of Object.entries(exampleFiles())) zip.addFile(name, buf);
  zip.addFile('imagens/refrigerante.png', placeholderPng());
  return zip.toBuffer();
}

module.exports = { exampleZip, exampleFiles, placeholderPng };
