const db = require('../config/db');
const { HttpError, parseJson } = require('../utils/http');

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanHours(h) {
  if (h === null || h === undefined) return null;
  if (!Array.isArray(h) || h.length !== 7) throw new HttpError(400, 'Horários inválidos.');
  return h.map((d, i) => {
    const closed = d && d.closed ? true : false;
    if (!closed && !(HHMM.test(d.open) && HHMM.test(d.close))) throw new HttpError(400, `Horário inválido (dia ${i + 1}).`);
    return { closed, open: closed ? null : d.open, close: closed ? null : d.close };
  });
}

// Considera janelas que viram a madrugada (ex.: 18:00–02:00).
function isOpenNow(hours, now = new Date()) {
  if (!hours) return true;
  const mins = now.getHours() * 60 + now.getMinutes();
  const toM = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const today = hours[now.getDay()], yest = hours[(now.getDay() + 6) % 7];
  if (today && !today.closed) {
    const o = toM(today.open), c = toM(today.close);
    if (c > o ? mins >= o && mins < c : mins >= o) return true;
  }
  if (yest && !yest.closed) {
    const o = toM(yest.open), c = toM(yest.close);
    if (c <= o && mins < c) return true;
  }
  return false;
}

async function get(est) {
  const [[e]] = await db.query('SELECT * FROM establishments WHERE id=?', [est]);
  e.opening_hours = parseJson(e.opening_hours);
  return e;
}

async function update(est, d, hours) {
  const w = d.whatsapp ? d.whatsapp.replace(/\D/g, '') : null;
  if (w && (w.length < 10 || w.length > 13)) throw new HttpError(400, 'WhatsApp inválido. Use DDD + número.');
  if (!d.pickup_enabled && !d.delivery_enabled) throw new HttpError(400, 'Habilite retirada ou entrega.');
  await db.query(
    `UPDATE establishments SET name=?, description=?, logo_url=?, cover_url=?, whatsapp=?, address=?, orders_paused=?,
       pickup_enabled=?, delivery_enabled=?, min_order=?, est_delivery_minutes=?, opening_hours=? WHERE id=?`,
    [d.name, d.description, d.logo_url, d.cover_url, w, d.address, d.orders_paused, d.pickup_enabled, d.delivery_enabled,
      d.min_order, d.est_delivery_minutes, hours ? JSON.stringify(hours) : null, est]);
}

module.exports = { get, update, cleanHours, isOpenNow };
