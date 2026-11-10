// Importação/exportação de cardápio: campos novos de produto/etapa/opção, mapeamento de ids externos,
// registro de importações, insumos + ficha técnica e disponibilidade programada.
module.exports = {
  name: '006-catalog-import',
  async up(conn) {
    const has = async (t, c) => (await conn.query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [t, c]))[0].length > 0;
    const add = async (t, probe, sql) => { if (!(await has(t, probe))) await conn.query(`ALTER TABLE ${t} ${sql}`); };

    await add('categories', 'description', 'ADD COLUMN description VARCHAR(255) NULL');
    await add('products', 'price_from', "ADD COLUMN price_from DECIMAL(10,2) NULL, ADD COLUMN cost DECIMAL(10,2) NULL, ADD COLUMN show_digital TINYINT(1) NOT NULL DEFAULT 1, ADD COLUMN show_tablet TINYINT(1) NOT NULL DEFAULT 1, ADD COLUMN redeem_points TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN sale_type VARCHAR(20) NOT NULL DEFAULT 'unitaria', ADD COLUMN availability_type VARCHAR(20) NOT NULL DEFAULT 'sempre'");
    await add('option_groups', 'sort_order', 'ADD COLUMN sort_order INT NOT NULL DEFAULT 0, ADD COLUMN available TINYINT(1) NOT NULL DEFAULT 1');
    await add('options', 'ref_product_id', 'ADD COLUMN description VARCHAR(255) NULL, ADD COLUMN cost DECIMAL(10,2) NULL, ADD COLUMN ref_product_id INT UNSIGNED NULL, ADD COLUMN sort_order INT NOT NULL DEFAULT 0, ADD COLUMN min_qty INT NULL, ADD COLUMN max_qty INT NULL, ADD CONSTRAINT fk_options_ref_product FOREIGN KEY (ref_product_id) REFERENCES products(id) ON DELETE SET NULL');
    await add('product_option_groups', 'sort_order', 'ADD COLUMN sort_order INT NOT NULL DEFAULT 0, ADD COLUMN min_select INT NULL, ADD COLUMN max_select INT NULL, ADD COLUMN available TINYINT(1) NOT NULL DEFAULT 1');

    await conn.query(`CREATE TABLE IF NOT EXISTS import_mappings (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      establishment_id INT UNSIGNED NOT NULL,
      source_system VARCHAR(60) NOT NULL,
      entity VARCHAR(20) NOT NULL,
      external_id VARCHAR(100) NOT NULL,
      internal_id INT UNSIGNED NOT NULL,
      is_ext TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_import_map (establishment_id, source_system, entity, external_id),
      INDEX idx_import_map_internal (establishment_id, entity, internal_id),
      FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS import_runs (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      establishment_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NULL,
      source_system VARCHAR(60) NOT NULL,
      action VARCHAR(12) NOT NULL,
      duplicates VARCHAR(12) NOT NULL,
      status VARCHAR(12) NOT NULL,
      summary MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX (establishment_id, created_at),
      FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS ingredients (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      establishment_id INT UNSIGNED NOT NULL,
      name VARCHAR(120) NOT NULL,
      category VARCHAR(60) NULL,
      unit VARCHAR(10) NOT NULL,
      stock_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
      stock_min DECIMAL(14,3) NOT NULL DEFAULT 0,
      unit_cost DECIMAL(12,4) NULL,
      available TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY uq_ingredient_name (establishment_id, name),
      FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS product_ingredients (
      product_id INT UNSIGNED NOT NULL,
      ingredient_id INT UNSIGNED NOT NULL,
      qty_per_unit DECIMAL(14,4) NOT NULL,
      unit VARCHAR(10) NOT NULL,
      loss_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
      notes VARCHAR(255) NULL,
      PRIMARY KEY (product_id, ingredient_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS product_schedules (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id INT UNSIGNED NOT NULL,
      weekday TINYINT NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      INDEX (product_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  },
};
