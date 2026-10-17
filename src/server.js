const app = require('./app');
const migrate = require('./config/migrate');
const port = Number(process.env.PORT) || 3000;

migrate()
  .then(() => app.listen(port, () => console.log(`Servidor em http://localhost:${port}`)))
  .catch((e) => { console.error('Falha ao preparar o banco de dados:', e.message); process.exit(1); });
