const bcrypt = require('bcryptjs');
const db = require('../config/db');
const tx = require('../utils/tx');
const { HttpError } = require('../utils/http');
const { nationalPhone } = require('../utils/br');

const RESERVED = new Set(['admin', 'api', 'm', 'print', 'login', 'cadastro', 'uploads', 'css', 'js', 'reset', 'termos', 'suporte', 'www', 'app', 'static', 'public', 'painel', 'cardapio', 'index', 'signup', 'logout']);
const COMMON = new Set(['12345678', '123456789', '1234567890', 'password', 'password1', 'senha123', 'senha1234', 'senha12345', 'qwerty123', 'abc12345', 'abcd1234', 'a1234567', '11111111', 'admin123', 'admin1234']);

// Retorna mensagem de erro ou '' se o link for utilizável (formato e palavras reservadas).
function slugProblem(slug) {
  if (!slug) return 'Escolha o endereço do seu cardápio.';
  if (slug.length < 3 || slug.length > 40) return 'Use de 3 a 40 caracteres.';
  if (!/^[a-z0-9-]+$/.test(slug)) return 'Use apenas letras minúsculas sem acento, números e hífen.';
  if (slug.startsWith('-') || slug.endsWith('-') || slug.includes('--')) return 'O hífen não pode ficar no início, no fim ou repetido.';
  if (RESERVED.has(slug)) return 'Este endereço é reservado. Escolha outro.';
  return '';
}

async function slugAvailable(slug) {
  const problem = slugProblem(slug);
  if (problem) return { available: false, reason: problem };
  const [[row]] = await db.query('SELECT id FROM establishments WHERE slug=?', [slug]);
  return row ? { available: false, reason: 'Este endereço já está em uso. Escolha outro.' } : { available: true };
}

function validate(b) {
  const bad = (field, msg) => { throw new HttpError(400, msg, field); };
  if (b.website) throw new HttpError(400, 'Requisição inválida.'); // campo isca (honeypot): só robôs preenchem
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = str(b.name), owner = str(b.owner), email = str(b.email).toLowerCase(), slug = str(b.slug).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';

  if (name.length < 2) bad('name', 'Informe o nome do estabelecimento (mínimo 2 caracteres).');
  if (name.length > 120) bad('name', 'O nome pode ter no máximo 120 caracteres.');
  const sp = slugProblem(slug); if (sp) bad('slug', sp);
  const phone = nationalPhone(b.whatsapp);
  if (!str(b.whatsapp)) bad('whatsapp', 'Informe o WhatsApp que receberá os pedidos.');
  if (!phone) bad('whatsapp', 'WhatsApp inválido. Use DDD e número, ex.: (11) 99999-8888.');
  if (owner.length < 2) bad('owner', 'Informe seu nome (mínimo 2 caracteres).');
  if (owner.length > 100) bad('owner', 'Seu nome pode ter no máximo 100 caracteres.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.includes('..')) bad('email', 'Informe um e-mail válido, como nome@exemplo.com.');
  if (email.length > 150) bad('email', 'O e-mail pode ter no máximo 150 caracteres.');
  if (password.length < 8) bad('password', 'A senha precisa ter pelo menos 8 caracteres.');
  if (password.length > 100) bad('password', 'A senha pode ter no máximo 100 caracteres.');
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) bad('password', 'A senha precisa ter pelo menos uma letra e um número.');
  if (COMMON.has(password.toLowerCase()) || password.toLowerCase() === email || password.toLowerCase() === owner.toLowerCase()) bad('password', 'Esta senha é fácil de adivinhar. Escolha outra.');
  if (b.confirm !== password) bad('confirm', 'As senhas não conferem.');
  return { name, owner, email, slug, phone, password };
}

async function createAccount(body) {
  const d = validate(body);
  const taken = await slugAvailable(d.slug);
  if (!taken.available) throw new HttpError(409, taken.reason, 'slug');
  const [[mail]] = await db.query('SELECT id FROM users WHERE email=?', [d.email]);
  if (mail) throw new HttpError(409, 'Este e-mail já está cadastrado. Entre na sua conta ou use outro e-mail.', 'email');
  const hash = await bcrypt.hash(d.password, 12);
  try {
    return await tx(async (conn) => {
      const [e] = await conn.query('INSERT INTO establishments (slug,name,whatsapp) VALUES (?,?,?)', [d.slug, d.name, d.phone]);
      const [u] = await conn.query("INSERT INTO users (establishment_id,name,email,password_hash,role) VALUES (?,?,?,?, 'admin')", [e.insertId, d.owner, d.email, hash]);
      return { id: u.insertId, name: d.owner, role: 'admin', establishmentId: e.insertId, establishmentName: d.name, slug: d.slug };
    });
  } catch (err) { // corrida entre dois cadastros simultâneos
    if (err.code === 'ER_DUP_ENTRY') {
      const f = /email/.test(err.sqlMessage || '') ? 'email' : 'slug';
      throw new HttpError(409, f === 'email' ? 'Este e-mail já está cadastrado.' : 'Este endereço já está em uso. Escolha outro.', f);
    }
    throw err;
  }
}

module.exports = { createAccount, slugAvailable };
