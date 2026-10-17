const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { HttpError } = require('../utils/http');

const ROLES = ['admin', 'atendente', 'cozinha'];
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function check({ name, email, role }, password, required) {
  if (!name || name.length > 100) throw new HttpError(400, 'Nome inválido.');
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 150) throw new HttpError(400, 'E-mail inválido.');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Perfil inválido.');
  if ((required || password) && (typeof password !== 'string' || password.length < 8 || password.length > 100)) throw new HttpError(400, 'A senha deve ter de 8 a 100 caracteres.');
}

const list = async (est) => (await db.query('SELECT id,name,email,role,active,created_at FROM users WHERE establishment_id=? ORDER BY name', [est]))[0];

async function create(est, b) {
  const u = { name: String(b.name || '').trim(), email: String(b.email || '').trim().toLowerCase(), role: b.role };
  check(u, b.password, true);
  const [r] = await db.query('INSERT INTO users (establishment_id,name,email,password_hash,role) VALUES (?,?,?,?,?)',
    [est, u.name, u.email, await bcrypt.hash(b.password, 12), u.role]);
  return r.insertId;
}

async function update(est, selfId, id, b) {
  const u = { name: String(b.name || '').trim(), email: String(b.email || '').trim().toLowerCase(), role: b.role };
  check(u, b.password, false);
  const active = b.active === true || b.active === 1 || b.active === '1' ? 1 : 0;
  if (id === selfId && (u.role !== 'admin' || !active)) throw new HttpError(400, 'Você não pode remover seu próprio acesso de administrador.');
  const [r] = await db.query('UPDATE users SET name=?, email=?, role=?, active=? WHERE establishment_id=? AND id=?', [u.name, u.email, u.role, active, est, id]);
  if (!r.affectedRows) throw new HttpError(404, 'Usuário não encontrado.');
  if (b.password) await db.query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(b.password, 12), id]);
  // Garante que sempre exista um admin ativo.
  const [[a]] = await db.query("SELECT COUNT(*) n FROM users WHERE establishment_id=? AND role='admin' AND active=1", [est]);
  if (!a.n) throw new HttpError(400, 'É necessário manter ao menos um administrador ativo.');
}

// Recuperação sem e-mail: o admin gera um link de uso único (válido por 1 h) e entrega ao usuário.
async function createResetToken(est, id) {
  const [[u]] = await db.query('SELECT id FROM users WHERE establishment_id=? AND id=?', [est, id]);
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  const token = crypto.randomBytes(32).toString('hex');
  await db.query('DELETE FROM password_resets WHERE user_id=?', [id]);
  await db.query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?, DATE_ADD(NOW(), INTERVAL 1 HOUR))', [id, sha(token)]);
  return token;
}

async function resetPassword(token, password) {
  if (typeof token !== 'string' || typeof password !== 'string' || password.length < 8 || password.length > 100) throw new HttpError(400, 'Dados inválidos. A senha deve ter ao menos 8 caracteres.');
  const [[r]] = await db.query('SELECT id,user_id FROM password_resets WHERE token_hash=? AND used=0 AND expires_at>NOW()', [sha(token)]);
  if (!r) throw new HttpError(400, 'Link inválido ou expirado. Peça um novo ao administrador.');
  await db.query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(password, 12), r.user_id]);
  await db.query('UPDATE password_resets SET used=1 WHERE user_id=?', [r.user_id]);
}

module.exports = { list, create, update, createResetToken, resetPassword };
