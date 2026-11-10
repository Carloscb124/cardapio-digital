// Leitura e gravação de CSV (UTF-8) com mensagens de erro legíveis. Usa csv-parse/csv-stringify (RFC 4180).
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

class CsvError extends Error { constructor(message, line) { super(message); this.line = line; } }

// Células que começam com = + - @ seriam fórmulas numa planilha: na exportação ganham um apóstrofo, que a importação remove.
const FORMULA = /^[=+\-@\t\r]/;
const guard = (v) => (typeof v === 'string' && FORMULA.test(v) && Number.isNaN(Number(v)) ? "'" + v : v);
const unguard = (v) => (typeof v === 'string' && /^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

function detectDelimiter(text) {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  const count = (d) => first.split(d).length - 1;
  const best = [',', ';', '\t'].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

const MESSAGES = {
  CSV_RECORD_INCONSISTENT_COLUMNS: 'número de colunas diferente do cabeçalho (confira vírgulas e aspas)',
  CSV_RECORD_INCONSISTENT_FIELDS_LENGTH: 'número de colunas diferente do cabeçalho (confira vírgulas e aspas)',
  CSV_QUOTE_NOT_CLOSED: 'aspas abertas e não fechadas',
  CSV_INVALID_CLOSING_QUOTE: 'aspas fora do lugar (use "" para aspas dentro de um texto)',
  CSV_NON_TRIMABLE_CHAR_AFTER_CLOSING_QUOTE: 'aspas fora do lugar (use "" para aspas dentro de um texto)',
  INVALID_OPENING_QUOTE: 'aspas fora do lugar (use "" para aspas dentro de um texto)',
};

// Devolve { headers, rows[{_line, ...colunas}], delimiter }. Lança CsvError com a linha do problema.
function parseCsv(buffer, { maxRows = 5000 } = {}) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
  if (text.includes('\uFFFD')) throw new CsvError('o arquivo não está em UTF-8 (salve como "CSV UTF-8" na planilha)');
  const delimiter = detectDelimiter(text);
  let headers = [];
  try { headers = (parse(text, { bom: true, delimiter, to_line: 1, relax_column_count: true })[0] || []).map((x) => String(x).trim()); } catch { /* o erro detalhado vem da leitura completa abaixo */ }
  const dup = headers.find((h, i) => headers.indexOf(h) !== i);
  if (dup) throw new CsvError(`coluna repetida no cabeçalho: "${dup}"`, 1);
  let records;
  try {
    records = parse(text, { bom: true, delimiter, columns: (h) => h.map((x) => String(x).trim()), skip_empty_lines: true, info: true, raw: true, relax_quotes: false });
  } catch (e) {
    throw new CsvError(MESSAGES[e.code] || e.message, e.lines || (e.context && e.context.lines));
  }
  if (records.length > maxRows) throw new CsvError(`mais de ${maxRows} linhas: divida o arquivo em partes menores`);
  const rows = records.map(({ record, info }) => ({ ...record, _line: info.lines - ((info.raw || '').match(/\n/g) || []).length }));
  return { headers, rows, delimiter };
}

const cell = (v) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : guard(typeof v === 'number' ? String(v) : v));

// Gera o CSV com BOM (o Excel reconhece UTF-8) e fim de linha CRLF.
function toCsv(columns, rows) {
  return '\uFEFF' + stringify(rows.map((r) => columns.map((c) => cell(r[c]))), { header: true, columns, record_delimiter: '\r\n' });
}

module.exports = { parseCsv, toCsv, unguard, guard, CsvError, detectDelimiter };
