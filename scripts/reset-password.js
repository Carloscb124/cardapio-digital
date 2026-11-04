// Mostra as contas de acesso ao painel que existem no banco e redefine a senha de uma delas.
// Uso: node scripts/reset-password.js [arquivo-de-variáveis]     (padrão: .env)
// Ex.: node scripts/reset-password.js .env.production   (use o arquivo que aponta para o MESMO banco da Vercel)
const path = require('path');
const readline = require('readline');
const envFile = process.argv[2] || '.env';
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

// Leitura de linhas que funciona tanto digitando quanto com entrada redirecionada.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
const queue = []; let waiter = null, closed = false, muted = false;
const write = rl._writeToOutput.bind(rl); rl._writeToOutput = (s) => { if (!muted) write(s); };
rl.on('line', (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else queue.push(l); });
rl.on('close', () => { closed = true; if (waiter) { const w = waiter; waiter = null; w(''); } });
function ask(question, hidden = false) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    const done = (v) => { if (hidden) { muted = false; process.stdout.write('\n'); } resolve(v); };
    if (queue.length) return done(queue.shift());
    if (closed) return done('');
    if (hidden) muted = true;
    waiter = done;
  });
}

(async () => {
  console.log(`Banco: ${process.env.DB_HOST || 'localhost'} / ${process.env.DB_NAME}   (variáveis de: ${envFile})`);
  const [users] = await db.query('SELECT u.id, u.email, u.name, u.role, u.active, e.name AS loja FROM users u JOIN establishments e ON e.id=u.establishment_id ORDER BY u.id');
  if (!users.length) { console.log('\nNenhuma conta de acesso encontrada neste banco. Crie uma com: npm run create-admin'); return; }
  console.log('\nContas de acesso ao painel neste banco:');
  users.forEach((u) => console.log(`  ${u.id}. ${u.email}  (${u.role}, ${u.active ? 'ativa' : 'DESATIVADA'})  loja: ${u.loja}`));

  const email = (await ask('\nE-mail da conta para trocar a senha (Enter para sair): ')).trim().toLowerCase();
  if (!email) return;
  const user = users.find((u) => u.email === email);
  if (!user) { console.log('Esse e-mail não está na lista acima. Confira como ele foi digitado no cadastro.'); process.exitCode = 1; return; }

  const pass = await ask('Nova senha (mín. 8 caracteres, com letra e número): ', true);
  const pass2 = await ask('Repita a nova senha: ', true);
  if (pass.length < 8 || pass.length > 100 || !/[A-Za-zÀ-ÿ]/.test(pass) || !/\d/.test(pass)) { console.log('Senha fraca: use de 8 a 100 caracteres, com pelo menos uma letra e um número.'); process.exitCode = 1; return; }
  if (pass !== pass2) { console.log('As senhas não conferem.'); process.exitCode = 1; return; }
  await db.query('UPDATE users SET password_hash=?, active=1 WHERE id=?', [await bcrypt.hash(pass, 12), user.id]);
  console.log(`\nPronto! A senha de ${user.email} foi alterada${user.active ? '' : ' e a conta foi reativada'}. Entre no painel com ela.`);
})().catch((e) => { console.error('Falha:', e.message); process.exitCode = 1; }).finally(async () => { rl.close(); await db.end(); });
