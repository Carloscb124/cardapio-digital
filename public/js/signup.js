// DDDs válidos (manter igual ao de src/utils/br.js). O servidor repete todas as validações.
const DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
const KEYS = ['name', 'slug', 'whatsapp', 'owner', 'email', 'password', 'confirm'];
const F = Object.fromEntries(KEYS.map((k) => [k, document.getElementById(k)]));
const touched = {};
let slugChecking = false, slugEdited = false, slugState = { value: '', ok: null, reason: '' }, slugTimer, slugSeq = 0;
const go = (url) => { location.href = url; };

const slugify = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
const slugFormat = (v) => {
  if (!v) return 'Escolha o endereço do seu cardápio.';
  if (v.length < 3 || v.length > 40) return 'Use de 3 a 40 caracteres.';
  if (!/^[a-z0-9-]+$/.test(v)) return 'Use apenas letras minúsculas sem acento, números e hífen.';
  if (v.startsWith('-') || v.endsWith('-') || v.includes('--')) return 'O hífen não pode ficar no início, no fim ou repetido.';
  return '';
};
const phoneDigits = (v) => { let d = v.replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); return d; };
const phoneOk = (d) => (d.length === 10 || d.length === 11) && DDDS.has(d.slice(0, 2)) && (d.length === 11 ? d[2] === '9' : /[2-5]/.test(d[2]));
function maskPhone(v) {
  const d = phoneDigits(v).slice(0, 11);
  if (d.length > 6) { const mid = d.length > 10 ? 5 : 4; return `(${d.slice(0, 2)}) ${d.slice(2, 2 + mid)}-${d.slice(2 + mid)}`; }
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return d ? `(${d}` : '';
}
const pwState = (v) => ({ len: v.length >= 8, letter: /[A-Za-zÀ-ÿ]/.test(v), digit: /\d/.test(v) });

const RULES = {
  name: (v) => (v.trim().length < 2 ? 'Informe o nome do estabelecimento (mínimo 2 caracteres).' : v.trim().length > 120 ? 'O nome pode ter no máximo 120 caracteres.' : ''),
  slug: (v) => { const s = v.trim().toLowerCase(); return slugFormat(s) || (slugState.value === s && slugState.ok === false ? slugState.reason : ''); },
  whatsapp: (v) => (!phoneDigits(v) ? 'Informe o WhatsApp que receberá os pedidos.' : phoneOk(phoneDigits(v)) ? '' : 'WhatsApp inválido. Use DDD e número, ex.: (11) 99999-8888.'),
  owner: (v) => (v.trim().length < 2 ? 'Informe seu nome (mínimo 2 caracteres).' : v.trim().length > 100 ? 'Seu nome pode ter no máximo 100 caracteres.' : ''),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && !v.includes('..') ? '' : 'Informe um e-mail válido, como nome@exemplo.com.'),
  password: (v) => { const s = pwState(v); return !s.len ? 'A senha precisa ter pelo menos 8 caracteres.' : !s.letter || !s.digit ? 'A senha precisa ter pelo menos uma letra e um número.' : ''; },
  confirm: (v) => (!v ? 'Repita a senha para confirmar.' : v !== F.password.value ? 'As senhas não conferem.' : ''),
};

function show(k, text, kind = 'err') {
  const p = document.getElementById('err-' + k);
  p.textContent = text; p.className = 'msg' + (kind === 'err' ? '' : ' ' + kind);
  F[k].setAttribute('aria-invalid', kind === 'err' && text ? 'true' : 'false');
}
function check(k, force) {
  if (!touched[k] && !force) return true;
  const m = RULES[k](F[k].value);
  if (m) { show(k, m); return false; }
  if (k === 'slug') { if (slugChecking) return true; if (slugState.ok === true && slugState.value === F.slug.value.trim().toLowerCase()) show(k, `Disponível: ${location.host}/m/${slugState.value}`, 'ok'); else show(k, ''); }
  else show(k, '');
  return true;
}

/* ---- Endereço (slug): sugestão a partir do nome + verificação de disponibilidade ---- */
function queueSlugCheck() {
  clearTimeout(slugTimer);
  const v = F.slug.value.trim().toLowerCase();
  if (slugFormat(v)) { slugChecking = false; slugState = { value: v, ok: null, reason: '' }; check('slug'); return; }
  if (slugState.value === v && slugState.ok !== null) { check('slug', true); return; }
  slugState = { value: v, ok: null, reason: '' }; slugChecking = true; show('slug', 'Verificando disponibilidade...', 'info');
  const seq = ++slugSeq;
  slugTimer = setTimeout(async () => {
    try {
      const r = await api('/api/signup/slug/' + encodeURIComponent(v));
      if (seq !== slugSeq) return;
      slugChecking = false;
      slugState = { value: v, ok: r.available, reason: r.reason || '' };
      touched.slug = true; check('slug', true);
    } catch (e) { if (seq === slugSeq) slugChecking = false; if (seq === slugSeq) show('slug', 'Não foi possível verificar agora. Confirmaremos ao criar a conta.', 'info'); }
  }, 400);
}

F.name.addEventListener('input', () => { if (!slugEdited) { F.slug.value = slugify(F.name.value); if (F.slug.value) { touched.slug = true; queueSlugCheck(); } } check('name'); });
F.slug.addEventListener('input', () => {
  F.slug.value = F.slug.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-');
  slugEdited = F.slug.value !== ''; touched.slug = true; queueSlugCheck();
});
F.whatsapp.addEventListener('input', () => { F.whatsapp.value = maskPhone(F.whatsapp.value); check('whatsapp'); });
F.password.addEventListener('input', () => {
  const s = pwState(F.password.value), pw = F.password.value;
  document.querySelectorAll('#rules li').forEach((li) => li.classList.toggle('met', s[li.dataset.rule]));
  const score = pw ? (s.len ? 1 : 0) + (s.letter && s.digit ? 1 : 0) + (pw.length >= 12 || /[^A-Za-z0-9]/.test(pw) ? 1 : 0) : 0;
  document.getElementById('meter').dataset.level = score;
  check('password'); if (touched.confirm) check('confirm');
});
for (const k of KEYS) {
  if (k !== 'slug') F[k].addEventListener('blur', () => { touched[k] = true; check(k); });
  else F.slug.addEventListener('blur', () => { touched.slug = true; check('slug'); });
  if (!['name', 'slug', 'whatsapp', 'password'].includes(k)) F[k].addEventListener('input', () => check(k));
}
document.getElementById('prefix').textContent = location.host + '/m/';
document.getElementById('toggle').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.textContent = on ? 'Ocultar' : 'Mostrar';
  F.password.type = F.confirm.type = on ? 'text' : 'password';
});

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit'), err = document.getElementById('formErr');
  err.textContent = '';
  KEYS.forEach((k) => { touched[k] = true; });
  const bad = KEYS.filter((k) => !check(k, true));
  if (bad.length) { F[bad[0]].focus(); err.textContent = bad.length === 1 ? 'Corrija o campo destacado para continuar.' : `Corrija os ${bad.length} campos destacados para continuar.`; return; }
  btn.disabled = true; btn.textContent = 'Criando sua conta...';
  try {
    await api('/api/signup', { method: 'POST', body: {
      name: F.name.value, slug: F.slug.value, whatsapp: phoneDigits(F.whatsapp.value), owner: F.owner.value, email: F.email.value,
      password: F.password.value, confirm: F.confirm.value, website: document.getElementById('website').value } });
    go('/admin');
  } catch (ex) {
    if (ex.field && F[ex.field]) {
      if (ex.field === 'slug') slugState = { value: F.slug.value.trim().toLowerCase(), ok: false, reason: ex.message };
      show(ex.field, ex.message); F[ex.field].focus();
    } else err.textContent = ex.message;
    btn.disabled = false; btn.textContent = 'Criar minha conta';
  }
});
