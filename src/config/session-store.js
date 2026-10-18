// Armazena as sessões no MySQL (sobrevivem a reinícios e funcionam em hospedagem "serverless").
// A validade é calculada pelo relógio do próprio banco, evitando diferença de fuso entre app e banco.
const session = require('express-session');

const secondsLeft = (sess) => {
  const e = sess && sess.cookie && sess.cookie.expires;
  return Math.max(60, e ? Math.ceil((new Date(e) - Date.now()) / 1000) : 8 * 3600);
};

class MySQLStore extends session.Store {
  constructor(db) { super(); this.db = db; }
  get(sid, cb) {
    this.db.query('SELECT data FROM sessions WHERE sid=? AND expires_at>NOW()', [sid]).then(([rows]) => {
      if (!rows[0]) return cb(null, null);
      try { cb(null, JSON.parse(rows[0].data)); } catch (e) { cb(e); }
    }, cb);
  }
  set(sid, sess, cb) {
    this.db.query(
      'INSERT INTO sessions (sid,data,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE data=VALUES(data), expires_at=VALUES(expires_at)',
      [sid, JSON.stringify(sess), secondsLeft(sess)]).then(() => {
      if (Math.random() < 0.02) this.db.query('DELETE FROM sessions WHERE expires_at<NOW()').catch(() => {}); // limpeza ocasional
      cb(null);
    }, cb);
  }
  touch(sid, sess, cb) { this.db.query('UPDATE sessions SET expires_at=DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE sid=?', [secondsLeft(sess), sid]).then(() => cb(null), cb); }
  destroy(sid, cb) { this.db.query('DELETE FROM sessions WHERE sid=?', [sid]).then(() => cb(null), cb); }
}
module.exports = MySQLStore;
