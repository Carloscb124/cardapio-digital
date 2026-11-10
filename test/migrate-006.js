// Atualização de um banco já em uso (versão 005, com dados) para a migração 006, inclusive no modo "serverless" (VERCEL=1, sem npm start).
require('dotenv').config();
const fs = require('fs'), path = require('path'); const { spawn } = require('child_process');
const db = require('../src/config/db'); const migrate = require('../src/config/migrate');
let fails = 0; const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'migrations')).sort().filter((x) => /^00[1-5]/.test(x))) { const m = require('../src/migrations/' + f); const c = await db.getConnection(); await m.up(c); c.release(); await db.query('INSERT INTO schema_migrations (name) VALUES (?)', [m.name]); }
  await db.query("INSERT INTO establishments (slug,name,whatsapp) VALUES ('antiga','Loja Antiga','11999998888')");
  await db.query("INSERT INTO categories (establishment_id,name,sort_order) VALUES (1,'Lanches',1)");
  await db.query("INSERT INTO products (establishment_id,category_id,name,description,price,promo_price) VALUES (1,1,'X-Burger','Hambúrguer',24,21.9),(1,1,'X-Frango','Frango',22,NULL)");
  await db.query("INSERT INTO option_groups (establishment_id,name,min_select,max_select) VALUES (1,'Adicionais',0,3)");
  await db.query("INSERT INTO options (group_id,name,price_delta) VALUES (1,'Bacon',4),(1,'Ovo',3)");
  await db.query('INSERT INTO product_option_groups (product_id,group_id) VALUES (1,1),(2,1)');
  console.log('banco simulado na versão 005, com dados');

  // 1) Primeira requisição de uma instância "serverless": o app é importado direto e migra sozinho.
  const child = spawn('node', ['-e', "require('./src/app').listen(3997)"], { env: { ...process.env, VERCEL: '1', NODE_ENV: 'production' }, stdio: 'ignore' });
  let up = false; for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch('http://localhost:3997/api/csrf', { headers: { 'x-forwarded-proto': 'https' } })).ok; } catch { await sleep(300); } }
  ok('a primeira requisição na hospedagem serverless aplica a migração 006 sozinha', up && (await db.query("SELECT name FROM schema_migrations WHERE name='006-catalog-import'"))[0].length === 1);
  const menu = await (await fetch('http://localhost:3997/api/public/antiga/menu')).json(); child.kill();
  ok('o cardápio público continua igual depois da migração', menu.categories[0].products.length === 2 && menu.categories[0].products[0].promo_price === 21.9 && menu.categories[0].products[0].groups[0].name === 'Adicionais' && menu.categories[0].products[0].groups[0].options.length === 2 && menu.categories[0].products[0].groups[0].max === 3, menu.categories[0].products[0]);

  // 2) Dados antigos ganham os padrões certos.
  const [[p]] = await db.query('SELECT price_from, cost, show_digital, show_tablet, redeem_points, sale_type, availability_type FROM products WHERE id=1');
  ok('produtos antigos: exibidos no digital e no tablet, sem pontos, venda unitária, disponibilidade permanente', p.price_from === null && p.cost === null && p.show_digital === 1 && p.show_tablet === 1 && p.redeem_points === 0 && p.sale_type === 'unitaria' && p.availability_type === 'sempre', p);
  const [[g]] = await db.query('SELECT available, sort_order FROM option_groups WHERE id=1'); ok('etapas antigas disponíveis', g.available === 1 && g.sort_order === 0);
  const [[l]] = await db.query('SELECT available, min_select, max_select, sort_order FROM product_option_groups WHERE product_id=1'); ok('ligações antigas disponíveis e sem ajuste por produto (valem os limites da etapa)', l.available === 1 && l.min_select === null && l.max_select === null);
  const [[o]] = await db.query('SELECT description, cost, ref_product_id, min_qty, max_qty FROM options WHERE id=1'); ok('opções antigas com os campos novos vazios', o.description === null && o.cost === null && o.ref_product_id === null && o.min_qty === null);
  const [tbl] = await db.query("SELECT TABLE_NAME n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('import_mappings','import_runs','ingredients','product_ingredients','product_schedules')"); ok('tabelas novas criadas', tbl.length === 5, tbl);
  await db.query("DELETE FROM schema_migrations WHERE name='006-catalog-import'"); await migrate(); ok('rodar de novo é seguro (idempotente)', (await db.query('SELECT COUNT(*) n FROM products'))[0][0].n === 2);
  console.log(fails ? `\n${fails} FALHA(S)` : '\nMigração 006 OK.'); await db.end(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
