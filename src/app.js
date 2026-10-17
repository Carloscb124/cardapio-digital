require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { issueCsrf, verifyCsrf } = require('./middleware/auth');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  throw new Error('Defina SESSION_SECRET (mín. 16 caracteres) no arquivo .env');
}

const app = express();
const CDN = 'https://cdn.jsdelivr.net';
app.disable('x-powered-by');
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
  hsts: process.env.NODE_ENV === 'production',
}));
app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true, // necessário para emitir o token CSRF antes do login
  // Etapa 1 usa MemoryStore (sessões somem ao reiniciar). Trocar por store em MySQL antes de produção.
  cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600 * 1000 },
}));

app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/api/csrf', issueCsrf);
app.use('/api', verifyCsrf);
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/signup', require('./routes/signup.routes'));
app.use('/api', require('./routes/admin.routes'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

const view = (f) => (req, res) => res.sendFile(path.join(__dirname, '..', 'views', f));
app.get('/m/:slug', view('menu.html'));
app.get('/print/:id', (req, res, next) => (req.session.user && /^\d+$/.test(req.params.id) ? view('print.html')(req, res, next) : res.redirect('/login.html')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d' }));
app.get('/admin', (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, '..', 'views', 'admin.html'));
});
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

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
