// Simula um banco na versão 004 (contas por loja, com a mesma cliente em duas lojas) e aplica a migração 005.
require('dotenv').config();
const fs = require('fs'), path = require('path');
const db = require('../src/config/db'); const migrate = require('../src/config/migrate');
let fails = 0; const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
(async () => {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'migrations')).sort().filter((x) => /^00[1-4]/.test(x))) {
    const m = require('../src/migrations/' + f); const c = await db.getConnection(); await m.up(c); c.release(); await db.query('INSERT INTO schema_migrations (name) VALUES (?)', [m.name]);
  }
  await db.query("INSERT INTO establishments (slug,name) VALUES ('loja-a','Loja A'),('loja-b','Loja B')");
  await db.query("INSERT INTO customer_accounts (establishment_id,name,phone,password_hash,reset_hash,reset_expires) VALUES (1,'Ana A','11988887777','hashA','x',NOW()),(2,'Ana B','11988887777','hashB',NULL,NULL),(2,'Beto','21977776666','hashC',NULL,NULL)");
  await db.query("INSERT INTO customer_addresses (account_id,label,address) VALUES (1,'Casa','Rua A, 1'),(2,'Trabalho','Rua B, 2')");
  const o = (est, n, acc) => db.query("INSERT INTO orders (establishment_id,number,customer_name,customer_phone,type,subtotal,total,payment_method,customer_account_id) VALUES (?,?,?,?,?,?,?,?,?)", [est, n, 'Ana', '11988887777', 'retirada', 10, 10, 'pix', acc]);
  await o(1, 1, 1); await o(2, 1, 2); await o(2, 2, 3);
  console.log('banco simulado na versão 004 criado');
  await migrate();
  const [acc] = await db.query('SELECT id,name,phone,password_hash FROM customer_accounts ORDER BY id');
  ok('uma conta por telefone (a mais antiga é mantida)', acc.length === 2 && acc[0].name === 'Ana A' && acc[0].password_hash === 'hashA' && acc[1].name === 'Beto', acc);
  const [ord] = await db.query('SELECT establishment_id e, customer_account_id a FROM orders ORDER BY id');
  ok('pedidos das duas lojas passam para a conta mantida; o de Beto permanece nele', ord[0].a === 1 && ord[1].a === 1 && ord[2].a === acc[1].id, ord);
  const [ad] = await db.query('SELECT account_id FROM customer_addresses ORDER BY id'); ok('endereços reaproveitados na conta mantida', ad.every((x) => x.account_id === 1), ad);
  const [cols] = await db.query("SELECT COLUMN_NAME n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customer_accounts'");
  const names = cols.map((c) => c.n); ok('colunas: sem loja e sem token de reset; com código de recuperação', !names.includes('establishment_id') && !names.includes('reset_hash') && !names.includes('reset_expires') && names.includes('recovery_hash'), names);
  const [ix] = await db.query("SELECT NON_UNIQUE nu FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customer_accounts' AND INDEX_NAME='uq_account_phone'"); ok('telefone único no sistema todo', ix.length === 1 && Number(ix[0].nu) === 0, ix);
  let dup = false; try { await db.query("INSERT INTO customer_accounts (name,phone,password_hash) VALUES ('X','11988887777','h')"); } catch (e) { dup = e.code === 'ER_DUP_ENTRY'; } ok('o banco recusa telefone repetido', dup);
  await db.query("DELETE FROM schema_migrations WHERE name='005-global-customer-accounts'"); await migrate(); ok('rodar de novo é seguro (idempotente)', (await db.query('SELECT COUNT(*) n FROM customer_accounts'))[0][0].n === 2);
  console.log(fails ? `\n${fails} FALHA(S)` : '\nMigração 005 OK.'); await db.end(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
