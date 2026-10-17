const db = require('../config/db');

// Serviço genérico para tabelas que pertencem diretamente a um estabelecimento.
module.exports = ({ table, schema, order = 'id' }) => {
  const cols = schema.map((f) => f.name);
  const names = cols.map((c) => `\`${c}\``).join(',');
  return {
    list: async (est) => (await db.query(`SELECT * FROM \`${table}\` WHERE establishment_id=? ORDER BY ${order}`, [est]))[0],
    create: async (est, d) => (await db.query(
      `INSERT INTO \`${table}\` (establishment_id,${names}) VALUES (?${',?'.repeat(cols.length)})`, [est, ...cols.map((c) => d[c])]))[0].insertId,
    update: async (est, id, d) => (await db.query(
      `UPDATE \`${table}\` SET ${cols.map((c) => `\`${c}\`=?`).join(',')} WHERE establishment_id=? AND id=?`,
      [...cols.map((c) => d[c]), est, id]))[0].affectedRows,
    remove: async (est, id) => (await db.query(`DELETE FROM \`${table}\` WHERE establishment_id=? AND id=?`, [est, id]))[0].affectedRows,
  };
};
