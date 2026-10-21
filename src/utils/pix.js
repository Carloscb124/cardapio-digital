// Pix estático (BR Code / EMV QRCPS-MPM) conforme o Manual de Padrões do Banco Central.
const tlv = (id, value) => id + String(value.length).padStart(2, '0') + value;

function crc16(str) { // CRC16-CCITT (poly 0x1021, início 0xFFFF)
  let crc = 0xffff;
  for (const byte of Buffer.from(str, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Nome e cidade: só ASCII em maiúsculas (compatível com todos os bancos), nos limites do padrão.
const clean = (s, max) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max).trim();

function buildPix({ key, name, city, amount, txid }) {
  const account = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  let p = tlv('00', '01') + tlv('01', '11') + tlv('26', account) + tlv('52', '0000') + tlv('53', '986');
  if (amount && Number(amount) > 0) p += tlv('54', Number(amount).toFixed(2));
  const id = String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  p += tlv('58', 'BR') + tlv('59', clean(name, 25)) + tlv('60', clean(city, 15)) + tlv('62', tlv('05', id));
  p += '6304';
  return p + crc16(p);
}

/* ---- Validação de chaves ---- */
function validCpf(raw) {
  const d = String(raw).replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
function validCnpj(raw) {
  const d = String(raw).replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}
module.exports = { buildPix, crc16, clean, validCpf, validCnpj };
