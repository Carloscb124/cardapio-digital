// Cria um estabelecimento e seu administrador. A senha é pedida no terminal (não fica em arquivo).
require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));
function askHidden(q) {
  return new Promise((resolve) => {
    process.stdout.write(q);
    rl._writeToOutput = () => {};
    rl.question('', (a) => { rl._writeToOutput = rl.constructor.prototype._writeToOutput; process.stdout.write('\n'); resolve(a); });
  });
}

(async () => {
  const estName = (await ask('Nome do estabelecimento: ')).trim();
  const slug = (await ask('Link do cardápio (ex.: minha-pizzaria): ')).trim().toLowerCase();
  const whatsapp = (await ask('WhatsApp com DDD (só números, opcional): ')).replace(/\D/g, '');
  const name = (await ask('Seu nome: ')).trim();
  const email = (await ask('E-mail de login: ')).trim().toLowerCase();
  const pass = await askHidden('Senha (mín. 8 caracteres): ');
  const pass2 = await askHidden('Repita a senha: ');
  rl.close();

  if (!estName || !name) throw new Error('Nome é obrigatório.');
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) throw new Error('Link inválido: use letras minúsculas, números e hífen (3-60).');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('E-mail inválido.');
  if (pass.length < 8) throw new Error('Senha muito curta.');
  if (pass !== pass2) throw new Error('As senhas não conferem.');

  const hash = await bcrypt.hash(pass, 12);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [e] = await conn.query('INSERT INTO establishments (slug, name, whatsapp) VALUES (?,?,?)', [slug, estName, whatsapp || null]);
    await conn.query("INSERT INTO users (establishment_id, name, email, password_hash, role) VALUES (?,?,?,?, 'admin')", [e.insertId, name, email, hash]);
    await conn.commit();
    console.log('\nPronto! Inicie com "npm start" e entre em http://localhost:3000');
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); await db.end(); }
})().catch((e) => {
  console.error('\nFalha:', e.code === 'ER_DUP_ENTRY' ? 'link ou e-mail já cadastrado.' : e.message);
  process.exit(1);
});
