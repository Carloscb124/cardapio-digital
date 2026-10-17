-- Esquema completo (todas as etapas). Executado por: npm run db:init
CREATE TABLE IF NOT EXISTS establishments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  logo_url VARCHAR(255) NULL,
  cover_url VARCHAR(255) NULL,
  whatsapp VARCHAR(20) NULL,
  address VARCHAR(255) NULL,
  orders_paused TINYINT(1) NOT NULL DEFAULT 0,
  pickup_enabled TINYINT(1) NOT NULL DEFAULT 1,
  delivery_enabled TINYINT(1) NOT NULL DEFAULT 1,
  min_order DECIMAL(10,2) NOT NULL DEFAULT 0,
  est_delivery_minutes INT NULL,
  opening_hours JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  establishment_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('admin','atendente','cozinha') NOT NULL DEFAULT 'atendente',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_resets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  INDEX (token_hash),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  establishment_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  INDEX (establishment_id, sort_order),
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  establishment_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  price DECIMAL(10,2) NOT NULL,
  promo_price DECIMAL(10,2) NULL,
  image_url VARCHAR(255) NULL,
  available TINYINT(1) NOT NULL DEFAULT 1,
  prep_minutes INT NULL,
  track_stock TINYINT(1) NOT NULL DEFAULT 0,
  stock_qty INT NOT NULL DEFAULT 0,
  stock_min INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  INDEX (establishment_id, category_id),
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS option_groups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  establishment_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  min_select INT NOT NULL DEFAULT 0,
  max_select INT NOT NULL DEFAULT 1,
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS options (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  price_delta DECIMAL(10,2) NOT NULL DEFAULT 0,
  available TINYINT(1) NOT NULL DEFAULT 1,
  track_stock TINYINT(1) NOT NULL DEFAULT 0,
  stock_qty INT NOT NULL DEFAULT 0,
  FOREIGN KEY (group_id) REFERENCES option_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_option_groups (
  product_id INT UNSIGNED NOT NULL,
  group_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (product_id, group_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES option_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS combos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  establishment_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  price DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(255) NULL,
  available TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS combo_items (
  combo_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  PRIMARY KEY (combo_id, product_id),
  FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  establishment_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  UNIQUE (establishment_id, phone),
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS delivery_zones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  establishment_id INT UNSIGNED NOT NULL,
  neighborhood VARCHAR(100) NOT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS coupons (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  establishment_id INT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL,
  type ENUM('percent','fixed') NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  min_order DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_discount DECIMAL(10,2) NULL,
  expires_at DATETIME NULL,
  max_uses INT NULL,
  used_count INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE (establishment_id, code),
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  establishment_id INT UNSIGNED NOT NULL,
  number INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  type ENUM('entrega','retirada') NOT NULL,
  address VARCHAR(255) NULL,
  neighborhood VARCHAR(100) NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  coupon_id INT UNSIGNED NULL,
  payment_method VARCHAR(30) NOT NULL,
  change_for DECIMAL(10,2) NULL,
  notes VARCHAR(500) NULL,
  status ENUM('aguardando','confirmado','preparo','pronto','saiu_entrega','concluido','cancelado') NOT NULL DEFAULT 'aguardando',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE (establishment_id, number),
  INDEX (establishment_id, status),
  INDEX (establishment_id, created_at),
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  notes VARCHAR(255) NULL,
  INDEX (product_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_item_options (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_item_id INT UNSIGNED NOT NULL,
  option_id INT UNSIGNED NULL,
  name VARCHAR(80) NOT NULL,
  price_delta DECIMAL(10,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  establishment_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NULL,
  option_id INT UNSIGNED NULL,
  delta INT NOT NULL,
  reason VARCHAR(100) NOT NULL,
  order_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (establishment_id, created_at),
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB;
