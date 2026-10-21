const QR = require('qrcode');
const db = require('../config/db');
const { HttpError } = require('../utils/http');
const { nationalPhone } = require('../utils/br');
const { buildPix, clean, validCpf, validCnpj } = require('../utils/pix');

const TYPES = ['cpf', 'cnpj', 'telefone', 'email', 'aleatoria'];
const bad = (field, msg) => { throw new HttpError(400, msg, field); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeKey(type, raw) {
  switch (type) {
    case 'cpf': if (!validCpf(raw)) bad('pix_key', 'CPF inválido. Confira os 11 dígitos.'); return raw.replace(/\D/g, '');
    case 'cnpj': if (!validCnpj(raw)) bad('pix_key', 'CNPJ inválido. Confira os 14 dígitos.'); return raw.replace(/\D/g, '');
    case 'telefone': { const n = nationalPhone(raw); if (!n) bad('pix_key', 'Telefone inválido. Use DDD e número, ex.: (11) 99999-8888.'); return '+55' + n; }
    case 'email': if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw) || raw.length > 77) bad('pix_key', 'E-mail inválido (máx. 77 caracteres).'); return raw.toLowerCase();
    default: if (!UUID.test(raw)) bad('pix_key', 'Chave aleatória inválida. Ela tem o formato 123e4567-e89b-12d3-a456-426614174000.'); return raw.toLowerCase();
  }
}

// Chave vazia desativa o Pix. Com chave, exige tipo, nome do recebedor e cidade (campos obrigatórios do QR Code).
function cleanConfig(b) {
  const key = String(b.pix_key || '').trim();
  if (!key) return { type: null, key: null, name: null, city: null };
  if (!TYPES.includes(b.pix_key_type)) bad('pix_key_type', 'Escolha o tipo da chave.');
  const rawName = String(b.pix_name || '').trim(), rawCity = String(b.pix_city || '').trim();
  if (rawName.length > 25) bad('pix_name', 'O nome do recebedor pode ter no máximo 25 caracteres.');
  if (rawCity.length > 15) bad('pix_city', 'A cidade pode ter no máximo 15 caracteres.');
  const name = clean(rawName, 25), city = clean(rawCity, 15);
  if (name.length < 2) bad('pix_name', 'Informe o nome do recebedor, como aparece na conta (letras e números).');
  if (city.length < 2) bad('pix_city', 'Informe a cidade do recebedor.');
  return { type: b.pix_key_type, key: normalizeKey(b.pix_key_type, key), name, city };
}

async function get(est) {
  const [[r]] = await db.query('SELECT pix_key_type, pix_key, pix_name, pix_city FROM establishments WHERE id=?', [est]);
  return { ...r, configured: !!(r.pix_key && r.pix_name && r.pix_city) };
}

async function save(est, body) {
  const c = cleanConfig(body || {});
  await db.query('UPDATE establishments SET pix_key_type=?, pix_key=?, pix_name=?, pix_city=? WHERE id=?', [c.type, c.key, c.name, c.city, est]);
  return get(est);
}

const configured = (e) => !!(e.pix_key && e.pix_name && e.pix_city);
const payloadFor = (e, number, total) => (configured(e) && total > 0 ? buildPix({ key: e.pix_key, name: e.pix_name, city: e.pix_city, amount: total, txid: 'PED' + number }) : null);
const qrDataUrl = (payload) => QR.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 320 });

// QR de teste (R$ 1,00) para o administrador conferir o nome do recebedor no app do banco, sem pagar.
async function preview(est) {
  const e = await get(est);
  if (!e.configured) return null;
  const payload = buildPix({ key: e.pix_key, name: e.pix_name, city: e.pix_city, amount: 1, txid: 'TESTE' });
  return { payload, qr: await qrDataUrl(payload), name: e.pix_name };
}

module.exports = { get, save, preview, payloadFor, qrDataUrl, configured };
