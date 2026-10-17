const db = require('../config/db');
module.exports = async function tx(fn) {
  const conn = await db.getConnection();
  try { await conn.beginTransaction(); const r = await fn(conn); await conn.commit(); return r; }
  catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
};
