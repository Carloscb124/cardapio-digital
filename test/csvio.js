// Testes unitários do leitor/gravador de CSV. Uso: node test/csvio.js
const { parseCsv, toCsv, CsvError } = require('../src/utils/csvio');
let fails = 0; const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
const err = (buf) => { try { parseCsv(buf); return null; } catch (e) { return e; } };

const cols = ['id', 'nome', 'descricao', 'preco'];
const rows = [
  { id: 'a1', nome: 'Misto Quente', descricao: 'Mussarela, Cheddar, Presunto, Catchup. Maionese da Casa', preco: '17.00' },
  { id: 'a2', nome: 'Pão "especial" de queijo', descricao: 'Linha 1\nLinha 2 com acentuação: ção, ã, é, ü', preco: '9.50' },
  { id: 'a3', nome: 'Vazio', descricao: null, preco: 0 },
  { id: 'a4', nome: '=SOMA(1+1)', descricao: '-ou + ou @', preco: '3.00' },
  { id: 'a5', nome: '  espaços  ', descricao: '', preco: true },
];
const csv = toCsv(cols, rows);
ok('começa com BOM UTF-8 e usa CRLF', csv.startsWith('\uFEFF') && csv.includes('\r\n'));
const back = parseCsv(Buffer.from(csv, 'utf8'));
ok('ida e volta preserva vírgulas, aspas, quebras de linha e acentos', back.rows[0].descricao === rows[0].descricao && back.rows[1].nome === 'Pão "especial" de queijo' && back.rows[1].descricao === 'Linha 1\nLinha 2 com acentuação: ção, ã, é, ü', back.rows.map((r) => r.nome));
ok('campos vazios continuam vazios (não viram 0 nem false)', back.rows[2].descricao === '' && back.rows[2].preco === '0' && back.rows[4].descricao === '');
ok('booleanos saem como true/false', back.rows[4].preco === 'true');
ok('cabeçalho preservado e números de linha corretos (inclusive com quebra de linha dentro da célula)', back.headers.join() === cols.join() && back.rows.map((r) => r._line).join() === '2,3,5,6,7', back.rows.map((r) => r._line));
ok('fórmulas de planilha são neutralizadas na saída', csv.includes("'=SOMA(1+1)") && csv.includes("'-ou + ou @"), csv);
ok('...e o apóstrofo é a única alteração (a importação o remove depois)', back.rows[3].nome === "'=SOMA(1+1)");
ok('números negativos legítimos não ganham apóstrofo', toCsv(['n'], [{ n: '-5' }]).includes('\r\n-5'));

ok('detecta ponto e vírgula (Excel em português)', parseCsv(Buffer.from('id;nome;preco\n1;Café;7,50\n2;"Chá; verde";6,00\n')).rows[1].nome === 'Chá; verde');
ok('detecta tabulação', parseCsv(Buffer.from('id\tnome\n1\tSuco\n')).rows[0].nome === 'Suco');
ok('aceita BOM e fim de linha do Windows', parseCsv(Buffer.from('\uFEFFid,nome\r\n1,Água\r\n', 'utf8')).rows[0].nome === 'Água');
ok('ignora linhas em branco', parseCsv(Buffer.from('id,nome\n\n1,A\n\n2,B\n')).rows.length === 2);
ok('arquivo só com cabeçalho dá zero linhas e devolve as colunas', (() => { const r = parseCsv(Buffer.from('id,nome\n')); return r.rows.length === 0 && r.headers.join() === 'id,nome'; })());
ok('espaços no cabeçalho são removidos', parseCsv(Buffer.from(' id , nome \n1,A\n')).headers.join() === 'id,nome');

let e = err(Buffer.from('id,nome\n1,A\n2,B,extra\n')); ok('linha com colunas a mais: erro com o número da linha', e instanceof CsvError && /colunas/.test(e.message) && e.line === 3, e && [e.message, e.line]);
e = err(Buffer.from('id,nome\n1,A\n2\n')); ok('linha com colunas a menos', e && /colunas/.test(e.message) && e.line === 3, e && [e.message, e.line]);
e = err(Buffer.from('id,nome\n1,"A\n2,B\n')); ok('aspas não fechadas', e && /aspas/.test(e.message), e && e.message);
e = err(Buffer.from('id,nome\n1,A"B\n')); ok('aspas no meio de um texto sem proteção', e && /aspas/.test(e.message), e && e.message);
e = err(Buffer.from('id,id\n1,2\n')); ok('colunas repetidas no cabeçalho', e && /repetida/.test(e.message), e && e.message);
e = err(Buffer.from('id,nome\n1,Caf\xE9\n', 'latin1')); ok('arquivo em Latin-1 (Excel antigo) é recusado com instrução clara', e && /UTF-8/.test(e.message), e && e.message);
e = (() => { try { parseCsv(Buffer.from('a\n' + '1\n'.repeat(20)), { maxRows: 10 }); } catch (x) { return x; } })(); ok('limite de linhas por arquivo', e && /mais de 10 linhas/.test(e.message));
console.log(fails ? `\n${fails} FALHA(S)` : '\nCSV OK.'); process.exit(fails ? 1 : 0);
