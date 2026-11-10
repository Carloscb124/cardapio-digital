// Formato do pacote de migração de cardápio (CSV). Versão do esquema: 1.0
const FORMAT = 'cardapio-csv';
const VERSION = '1.0';
const SYSTEM_ID = 'cardapio-digital';

// Nome do arquivo e colunas (nessa ordem). "required" = colunas que precisam existir no cabeçalho.
const FILES = {
  categorias: { file: 'categorias.csv', required: ['categoria_id', 'nome'], columns: ['categoria_id', 'id_externo', 'nome', 'descricao', 'ordem_exibicao', 'disponivel'] },
  produtos: { file: 'produtos.csv', required: ['produto_id', 'nome'], columns: ['produto_id', 'id_externo', 'nome', 'categoria_id', 'descricao', 'preco', 'preco_antigo', 'preco_a_partir_de', 'custo', 'disponivel', 'exibir_cardapio_digital', 'exibir_tablet', 'troca_por_pontos', 'imagem_arquivo', 'tipo_venda', 'ordem_exibicao', 'tipo_disponibilidade'] },
  etapas: { file: 'etapas.csv', required: ['etapa_id', 'nome'], columns: ['etapa_id', 'id_externo', 'nome', 'quantidade_minima', 'quantidade_maxima', 'tipo_selecao', 'obrigatoria', 'ordem_exibicao', 'disponivel'] },
  produto_etapas: { file: 'produto_etapas.csv', required: ['produto_id', 'etapa_id'], columns: ['produto_id', 'etapa_id', 'ordem_exibicao', 'quantidade_minima', 'quantidade_maxima', 'disponivel'] },
  opcoes: { file: 'opcoes.csv', required: ['opcao_id', 'etapa_id', 'nome'], columns: ['opcao_id', 'id_externo', 'etapa_id', 'produto_referenciado_id', 'nome', 'descricao', 'preco_adicional', 'custo_adicional', 'disponivel', 'ordem_exibicao', 'quantidade_minima', 'quantidade_maxima'] },
  imagens: { file: 'imagens.csv', required: ['produto_id'], columns: ['imagem_id', 'produto_id', 'nome_arquivo', 'caminho_arquivo', 'url_original', 'texto_alternativo', 'ordem_exibicao'] },
  disponibilidade: { file: 'disponibilidade.csv', required: ['produto_id', 'dia_semana', 'hora_inicio', 'hora_fim'], columns: ['produto_id', 'dia_semana', 'hora_inicio', 'hora_fim'] },
  insumos: { file: 'estoque.csv', required: ['insumo_id', 'nome', 'unidade_medida'], columns: ['insumo_id', 'id_externo', 'nome', 'categoria_insumo', 'unidade_medida', 'quantidade_estoque', 'estoque_minimo', 'custo_unitario', 'disponivel'] },
  ficha_tecnica: { file: 'ficha_tecnica.csv', required: ['produto_id', 'insumo_id', 'quantidade_por_unidade', 'unidade_medida'], columns: ['produto_id', 'insumo_id', 'quantidade_por_unidade', 'unidade_medida', 'perda_percentual', 'observacao'] },
};
// Ordem de processamento na importação: dependências primeiro.
const ORDER = ['categorias', 'insumos', 'etapas', 'produtos', 'opcoes', 'produto_etapas', 'disponibilidade', 'ficha_tecnica', 'imagens'];
const LABEL = { categorias: 'Categorias', insumos: 'Insumos', etapas: 'Etapas', produtos: 'Produtos', opcoes: 'Opções', produto_etapas: 'Produtos × etapas', disponibilidade: 'Disponibilidade', ficha_tecnica: 'Ficha técnica', imagens: 'Imagens' };
const PREFIX = { categorias: 'cat', produtos: 'prod', etapas: 'etapa', opcoes: 'opcao', insumos: 'insumo' };

const UNITS = { kg: 'kg', g: 'g', l: 'L', litro: 'L', litros: 'L', ml: 'ml', un: 'unidade', und: 'unidade', unid: 'unidade', unidade: 'unidade', unidades: 'unidade' };
const UNIT_KIND = { kg: 'massa', g: 'massa', L: 'volume', ml: 'volume', unidade: 'contagem' };
const WEEKDAYS = { dom: 0, domingo: 0, seg: 1, segunda: 1, ter: 2, terca: 2, qua: 3, quarta: 3, qui: 4, quinta: 4, sex: 5, sexta: 5, sab: 6, sabado: 6 };

module.exports = { FORMAT, VERSION, SYSTEM_ID, FILES, ORDER, LABEL, PREFIX, UNITS, UNIT_KIND, WEEKDAYS };
