const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Hash falso para igualar o tempo de resposta quando o e-mail não existe.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 12);

exports.login = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password || email.length > 150 || password.length > 200) {
      return res.status(400).json({ error: 'Informe e-mail e senha.' });
    }
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.role, u.password_hash, u.establishment_id, e.name AS establishment_name
         FROM users u JOIN establishments e ON e.id = u.establishment_id
        WHERE u.email = ? AND u.active = 1`, [email]);
    const user = rows[0];
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = {
        id: user.id, name: user.name, role: user.role,
        establishmentId: user.establishment_id, establishmentName: user.establishment_name,
      };
      res.json({ ok: true });
    });
  } catch (e) { next(e); }
};

exports.logout = (req, res) => {
  req.session.destroy(() => { res.clearCookie('sid'); res.json({ ok: true }); });
};

exports.me = (req, res) => res.json(req.session.user);
