let csrfToken = null;
async function getCsrf() {
  if (!csrfToken) csrfToken = (await (await fetch('/api/csrf', { credentials: 'same-origin' })).json()).token;
  return csrfToken;
}
async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (method !== 'GET') opts.headers['x-csrf-token'] = await getCsrf();
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Erro inesperado.'); e.status = res.status; e.field = data.field; throw e; }
  return data;
}
async function apiUpload(file) {
  const fd = new FormData(); fd.append('image', file);
  const res = await fetch('/api/uploads', { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': await getCsrf() }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha no envio da imagem.');
  return data.url;
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
