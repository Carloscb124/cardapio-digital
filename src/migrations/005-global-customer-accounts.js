// Conta de cliente universal: um cadastro por WhatsApp, válido em todas as lojas.
// Também troca o "link de nova senha gerado pela loja" por um código de recuperação que fica com o próprio cliente.
module.exports = {
  name: '005-global-customer-accounts',
  async up(conn) {
    const col = async (c) => (await conn.query("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customer_accounts' AND COLUMN_NAME=?", [c]))[0].length > 0;

    if (await col('establishment_id')) {
      // 1) Quem já tinha conta em mais de uma loja fica com a conta mais antiga; pedidos e endereços são reaproveitados nela.
      const [dups] = await conn.query('SELECT phone, MIN(id) AS keep_id FROM customer_accounts GROUP BY phone HAVING COUNT(*) > 1');
      for (const d of dups) {
        const ids = (await conn.query('SELECT id FROM customer_accounts WHERE phone=? AND id<>?', [d.phone, d.keep_id]))[0].map((r) => r.id);
        await conn.query('UPDATE orders SET customer_account_id=? WHERE customer_account_id IN (?)', [d.keep_id, ids]);
        await conn.query('UPDATE customer_addresses SET account_id=? WHERE account_id IN (?)', [d.keep_id, ids]);
        await conn.query('DELETE FROM customer_accounts WHERE id IN (?)', [ids]);
      }
      // 2) Remove o vínculo com a loja (chave estrangeira, índice e coluna).
      const [fks] = await conn.query("SELECT DISTINCT CONSTRAINT_NAME AS n FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customer_accounts' AND COLUMN_NAME='establishment_id' AND REFERENCED_TABLE_NAME IS NOT NULL");
      for (const f of fks) await conn.query(`ALTER TABLE customer_accounts DROP FOREIGN KEY \`${f.n}\``);
      const [idx] = await conn.query("SELECT DISTINCT INDEX_NAME AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customer_accounts' AND COLUMN_NAME='establishment_id'");
      for (const i of idx) await conn.query(`ALTER TABLE customer_accounts DROP INDEX \`${i.n}\``);
      await conn.query('ALTER TABLE customer_accounts DROP COLUMN establishment_id');
    }
    const hasUq = (await conn.query("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customer_accounts' AND INDEX_NAME='uq_account_phone'"))[0].length > 0;
    if (!hasUq) await conn.query('ALTER TABLE customer_accounts ADD UNIQUE INDEX uq_account_phone (phone)');
    if (!(await col('recovery_hash'))) await conn.query('ALTER TABLE customer_accounts ADD COLUMN recovery_hash CHAR(64) NULL');
    // Links de nova senha antigos (gerados pela loja) deixam de existir.
    if (await col('reset_hash')) await conn.query('ALTER TABLE customer_accounts DROP COLUMN reset_hash, DROP COLUMN reset_expires');
  },
};
