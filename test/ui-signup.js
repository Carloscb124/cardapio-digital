// Teste de interface do cadastro com jsdom. Uso: BASE=http://localhost:3000 node test/ui-signup.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = process.env.BASE || 'http://localhost:3000';
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let fails = 0; const errors = [];
const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(jar) {
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message)); vc.on('error', (...a) => errors.push(a.join(' ')));
  const html = read('public/cadastro.html').replace(/<script[^>]*src="[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: BASE + '/cadastro', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, ctx = dom.getInternalVMContext();
  w.fetch = async (u, o = {}) => { const r = await fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), cookie: jar.c } }); const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0]; return r; };
  const run = (f) => new vm.Script(read(f), { filename: f }).runInContext(ctx);
  run('public/js/api.js'); run('public/js/br.js'); run('public/js/signup.js');
  return w;
}
const type = (w, id, v) => { const el = w.document.getElementById(id); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const blur = (w, id) => w.document.getElementById(id).dispatchEvent(new w.Event('blur'));
const txt = (w, id) => w.document.getElementById(id).textContent;
const val = (w, id) => w.document.getElementById(id).value;
const submit = (w) => w.document.getElementById('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
const fill = (w, o) => Object.entries(o).forEach(([k, v]) => type(w, k, v));

(async () => {
  let jar = { c: '' }, w = open(jar);
  const doc = w.document;
  ok('todos os campos têm rótulo associado', ['name', 'slug', 'whatsapp', 'owner', 'email', 'password', 'confirm'].every((id) => doc.querySelector(`label[for="${id}"]`)));
  ok('prefixo do endereço mostra o domínio', /\/m\/$/.test(txt(w, 'prefix')), txt(w, 'prefix'));

  type(w, 'name', 'Pizzaria do Zé');
  ok('endereço sugerido a partir do nome', val(w, 'slug') === 'pizzaria-do-ze', val(w, 'slug'));
  ok('mostra "verificando" enquanto consulta', /Verificando/.test(txt(w, 'err-slug')), txt(w, 'err-slug'));
  await sleep(800); ok('endereço livre é confirmado', /Disponível: .*\/m\/pizzaria-do-ze/.test(txt(w, 'err-slug')), txt(w, 'err-slug'));
  type(w, 'slug', 'demo'); await sleep(800);
  ok('endereço em uso é recusado', /em uso/.test(txt(w, 'err-slug')) && doc.getElementById('slug').getAttribute('aria-invalid') === 'true', txt(w, 'err-slug'));
  type(w, 'slug', 'admin'); await sleep(800); ok('endereço reservado é recusado', /reservado/.test(txt(w, 'err-slug')), txt(w, 'err-slug'));
  type(w, 'slug', 'Meu Lanche'); ok('endereço é normalizado ao digitar', val(w, 'slug') === 'meu-lanche', val(w, 'slug'));
  type(w, 'slug', 'a'); ok('endereço curto: erro imediato', /3 a 40/.test(txt(w, 'err-slug')), txt(w, 'err-slug'));
  type(w, 'name', 'Outro Nome'); ok('editar o nome não sobrescreve endereço digitado à mão', val(w, 'slug') === 'a', val(w, 'slug'));

  type(w, 'whatsapp', '11999998888'); ok('máscara de celular', val(w, 'whatsapp') === '(11) 99999-8888', val(w, 'whatsapp'));
  type(w, 'whatsapp', '1133334444'); ok('máscara de fixo', val(w, 'whatsapp') === '(11) 3333-4444', val(w, 'whatsapp'));
  type(w, 'whatsapp', '+55 (11) 98888-7777'); ok('aceita +55 colado', val(w, 'whatsapp') === '(11) 98888-7777', val(w, 'whatsapp'));
  type(w, 'whatsapp', '00999998888'); blur(w, 'whatsapp'); ok('DDD inválido é recusado', /inválido/.test(txt(w, 'err-whatsapp')), txt(w, 'err-whatsapp'));
  type(w, 'whatsapp', '11999998888'); ok('erro some ao corrigir', txt(w, 'err-whatsapp') === '');

  blur(w, 'email'); ok('e-mail vazio recusado ao sair do campo', /válido/.test(txt(w, 'err-email')));
  type(w, 'email', 'carlos@x'); ok('e-mail incompleto recusado', /válido/.test(txt(w, 'err-email')));
  type(w, 'email', 'carlos@exemplo.com.br'); ok('e-mail correto limpa o erro', txt(w, 'err-email') === '');

  type(w, 'password', '1234567'); const rule = (r) => doc.querySelector(`#rules [data-rule="${r}"]`).classList.contains('met');
  ok('regras da senha: curta, sem letra', !rule('len') && !rule('letter') && rule('digit'));
  type(w, 'password', '12345678'); blur(w, 'password'); ok('senha só com números recusada', /letra e um número/.test(txt(w, 'err-password')), txt(w, 'err-password'));
  ok('medidor fraco', doc.getElementById('meter').dataset.level === '1', doc.getElementById('meter').dataset.level);
  type(w, 'password', 'Senha1234x'); ok('regras atendidas e medidor médio', rule('len') && rule('letter') && rule('digit') && doc.getElementById('meter').dataset.level === '2');
  type(w, 'password', 'Massa2026ok#forte'); ok('medidor forte', doc.getElementById('meter').dataset.level === '3');
  type(w, 'confirm', 'outra'); blur(w, 'confirm'); ok('confirmação diferente recusada', /não conferem/.test(txt(w, 'err-confirm')));
  type(w, 'confirm', 'Massa2026ok#forte'); ok('confirmação igual aceita', txt(w, 'err-confirm') === '');
  type(w, 'password', 'Massa2026ok#forte2'); ok('mudar a senha revalida a confirmação', /não conferem/.test(txt(w, 'err-confirm')));
  doc.getElementById('toggle').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('botão mostrar senha', doc.getElementById('password').type === 'text' && doc.getElementById('toggle').getAttribute('aria-pressed') === 'true');

  /* envio vazio: todos os erros, foco no primeiro, nada enviado */
  jar = { c: '' }; w = open(jar); submit(w); await sleep(100);
  const invalid = [...w.document.querySelectorAll('[aria-invalid="true"]')].map((e) => e.id);
  ok('envio vazio marca os 7 campos', invalid.length === 7, invalid);
  ok('foco vai ao primeiro campo inválido', w.document.activeElement.id === 'name', w.document.activeElement.id);
  ok('resumo do erro no formulário', /Corrija os 7 campos/.test(txt(w, 'formErr')), txt(w, 'formErr'));
  ok('nada foi enviado ao servidor', !jar.c);

  /* erro vindo do servidor aparece no campo certo */
  const data = { name: 'Lanchonete Zé', whatsapp: '11999998888', owner: 'José Silva', email: 'admin@demo.local', password: 'Zelanche2026', confirm: 'Zelanche2026' };
  fill(w, data); type(w, 'slug', 'lanchonete-ze'); await sleep(800); submit(w); await sleep(900);
  ok('e-mail já cadastrado aparece no campo e-mail', /já está cadastrado/.test(txt(w, 'err-email')) && w.document.activeElement.id === 'email', txt(w, 'err-email'));
  ok('botão volta a ficar utilizável', !w.document.getElementById('submit').disabled && w.document.getElementById('submit').textContent === 'Criar minha conta');

  /* sucesso */
  type(w, 'email', 'ze@lanchonete.com.br'); submit(w); await sleep(1500);
  const me = await w.api('/api/auth/me').catch((e) => ({ erro: e.message }));
  ok('cadastro concluído deixa o usuário logado', me.role === 'admin' && me.establishmentName === 'Lanchonete Zé', me);
  ok('botão indica criação em andamento (vai para /admin)', /Criando sua conta/.test(txt(w, 'submit')), txt(w, 'submit'));

  const real = errors.filter((e) => !/Not implemented: navigation/i.test(e));
  ok('sem erros de JavaScript', real.length === 0, real.slice(0, 5));
  console.log(fails ? `\n${fails} FALHA(S)` : '\nInterface do cadastro OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
