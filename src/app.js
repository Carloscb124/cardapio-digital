require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const db = require('./config/db');
const MySQLStore = require('./config/session-store');
const { issueCsrf, verifyCsrf } = require('./middleware/auth');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  throw new Error('Defina SESSION_SECRET (mín. 16 caracteres) nas variáveis de ambiente / arquivo .env');
}

const app = express();
const CDN = 'https://cdn.jsdelivr.net';
const PUBLIC = path.join(__dirname, '..', 'public');
const prod = process.env.NODE_ENV === 'production';
app.disable('x-powered-by');
// Atrás do proxy da Vercel: necessário para cookie "secure" e para enxergar o IP real (limite de tentativas).
if (process.env.VERCEL || process.env.TRUST_PROXY) app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", CDN],
      styleSrc: ["'self'", "'unsafe-inline'", CDN],
      fontSrc: ["'self'", CDN],
      imgSrc: ["'self'", 'data:', 'https:'],
      'upgrade-insecure-requests': null, // permite http://localhost
    },
  },
  hsts: prod,
}));

// Em hospedagem serverless ninguém roda "npm start": as migrações pendentes rodam uma vez por instância, antes da 1ª requisição.
if (process.env.VERCEL) {
  const migrate = require('./config/migrate');
  let ready;
  app.use((req, res, next) => { ready ||= migrate(); ready.then(() => next(), (e) => { ready = null; next(e); }); });
}

app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true, // necessário para emitir o token CSRF antes do login
  store: process.env.SESSION_STORE === 'memory' ? undefined : new MySQLStore(db),
  cookie: { httpOnly: true, sameSite: 'strict', secure: prod, maxAge: 8 * 3600 * 1000 },
}));

app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/api/csrf', issueCsrf);
app.use('/api', verifyCsrf);
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/signup', require('./routes/signup.routes'));
app.use('/api/customer', require('./routes/customer.routes'));
app.use('/api', require('./routes/admin.routes'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// Páginas (na Vercel estas rotas são reescritas para arquivos de public/ pelo vercel.json).
const page = (f) => (req, res) => res.sendFile(path.join(PUBLIC, f));
app.get('/m/:slug', page('menu.html'));
app.get('/pedido/:token', page('track.html'));
app.get('/print/:id', (req, res, next) => (req.session.user && /^\d+$/.test(req.params.id) ? page('print.html')(req, res, next) : res.redirect('/login.html')));
app.get('/admin', (req, res, next) => (req.session.user ? page('admin.html')(req, res, next) : res.redirect('/login.html')));

// Imagens enviadas ficam no banco; nomes aleatórios permitem cache longo.
app.get('/uploads/:name', async (req, res, next) => {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(req.params.name)) return next();
  try {
    const [[img]] = await db.query('SELECT mime,data FROM uploads WHERE name=?', [req.params.name]);
    if (!img) return next();
    res.set({ 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=604800, immutable' });
    res.send(img.data);
  } catch (e) { next(e); }
});
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d' })); // imagens antigas de instalações locais
app.use(express.static(PUBLIC, { extensions: ['html'] }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message, field: err.field });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Já existe um registro com esse valor.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Imagem muito grande (máx. 2 MB).' });
  if (err.message === 'FORMATO') return res.status(400).json({ error: 'Formato inválido. Use JPG, PNG ou WebP.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requisição inválida.' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
});

module.exports = app;
