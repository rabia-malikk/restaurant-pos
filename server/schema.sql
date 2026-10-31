-- Run with a MySQL account allowed to create databases and tables.
-- Create/grant the separate application DB_USER from .env and create the first admin afterward.
CREATE DATABASE IF NOT EXISTS hawt_pos
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE hawt_pos;

CREATE TABLE IF NOT EXISTS app_config (
  config_key VARCHAR(100) NOT NULL PRIMARY KEY,
  value      VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO app_config (config_key, value) VALUES
  ('limit.max_admin_users', '-1'),
  ('limit.max_staff_users', '-1'),
  ('limit.max_upload_mb', '5'),
  ('limit.max_open_orders_per_user', '20'),
  ('setting.lock_timeout_minutes', '5'),
  ('setting.tax_percent', '0')
ON DUPLICATE KEY UPDATE config_key = VALUES(config_key);

CREATE TABLE IF NOT EXISTS users (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  username           VARCHAR(50) NOT NULL,
  password_hash      VARCHAR(255) NOT NULL,
  role               ENUM('admin', 'staff') NOT NULL,
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  created_by         BIGINT UNSIGNED NULL,
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until       DATETIME NULL,
  last_login_at      DATETIME NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role_active (role, is_active),
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_features (
  user_id     BIGINT UNSIGNED NOT NULL,
  feature_key ENUM('orders', 'menu', 'kitchen') NOT NULL,
  PRIMARY KEY (user_id, feature_key),
  CONSTRAINT fk_user_features_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_master (
  contact_number VARCHAR(40) NOT NULL PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(255) NULL,
  address        VARCHAR(500) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_categories_active_order (is_active, sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS documents (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc_type      VARCHAR(40) NOT NULL,
  entity_type   VARCHAR(40) NOT NULL,
  entity_id     INT UNSIGNED NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  size_bytes    BIGINT UNSIGNED NOT NULL,
  sha256        CHAR(64) NOT NULL,
  uploaded_by   BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  KEY idx_documents_entity (entity_type, entity_id),
  KEY idx_documents_deleted_at (deleted_at),
  CONSTRAINT fk_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS document_blobs (
  document_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  content     LONGBLOB NOT NULL,
  CONSTRAINT fk_document_blobs_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS menu_items (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id        INT UNSIGNED NOT NULL,
  name               VARCHAR(150) NOT NULL,
  description        TEXT NULL,
  price              DECIMAL(10,2) NOT NULL,
  meal_available     TINYINT(1) NOT NULL DEFAULT 0,
  meal_price         DECIMAL(10,2) NOT NULL DEFAULT 0,
  prep_time_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  image_document_id  BIGINT UNSIGNED NULL,
  is_available       TINYINT(1) NOT NULL DEFAULT 1,
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  sort_order         INT NOT NULL DEFAULT 0,
  created_by         BIGINT UNSIGNED NOT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_menu_items_category_order (category_id, is_active, sort_order),
  KEY idx_menu_items_image (image_document_id),
  CONSTRAINT fk_menu_items_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_menu_items_image FOREIGN KEY (image_document_id) REFERENCES documents(id),
  CONSTRAINT fk_menu_items_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_menu_items_price CHECK (price > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_sessions (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  UNIQUE KEY uq_user_sessions_token_hash (token_hash),
  KEY idx_user_sessions_user_active (user_id, revoked_at, expires_at),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_attempts (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(50) NOT NULL,
  user_id        BIGINT UNSIGNED NULL,
  success        TINYINT(1) NOT NULL,
  failure_reason VARCHAR(32) NULL,
  ip_address     VARCHAR(45) NULL,
  user_agent     VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_attempts_username_date (username, created_at),
  KEY idx_login_attempts_user_date (user_id, created_at),
  CONSTRAINT fk_login_attempts_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_counters (
  counter_date DATE NOT NULL PRIMARY KEY,
  last_no      INT UNSIGNED NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_no         VARCHAR(20) NOT NULL,
  order_type       ENUM('dine_in', 'takeaway', 'delivery') NOT NULL,
  status           ENUM('draft', 'in_progress', 'checked_out', 'cancelled') NOT NULL DEFAULT 'draft',
  customer_name    VARCHAR(150) NULL,
  customer_phone   VARCHAR(40) NULL,
  delivery_address TEXT NULL,
  table_no         VARCHAR(40) NULL,
  notes            TEXT NULL,
  created_by       BIGINT UNSIGNED NOT NULL,
  locked_by        BIGINT UNSIGNED NULL,
  locked_at        DATETIME NULL,
  lock_expires_at  DATETIME NULL,
  subtotal         DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_type    ENUM('amount', 'percentage') NOT NULL DEFAULT 'amount',
  discount_value   DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax              DECIMAL(12,2) NOT NULL DEFAULT 0,
  delivery_fee     DECIMAL(12,2) NOT NULL DEFAULT 0,
  total            DECIMAL(12,2) NOT NULL DEFAULT 0,
  checked_out_by   BIGINT UNSIGNED NULL,
  checked_out_at   DATETIME NULL,
  cancelled_by     BIGINT UNSIGNED NULL,
  cancelled_at     DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_order_no (order_no),
  KEY idx_orders_status_updated (status, updated_at),
  KEY idx_orders_creator_status (created_by, status),
  KEY idx_orders_lock_expiry (locked_by, lock_expires_at),
  KEY idx_orders_checkout_date (status, checked_out_at),
  KEY idx_orders_cancelled_at (status, cancelled_at),
  CONSTRAINT fk_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_orders_locked_by FOREIGN KEY (locked_by) REFERENCES users(id),
  CONSTRAINT fk_orders_checked_out_by FOREIGN KEY (checked_out_by) REFERENCES users(id),
  CONSTRAINT fk_orders_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_rounds (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id           BIGINT UNSIGNED NOT NULL,
  round_no           INT UNSIGNED NOT NULL,
  status             ENUM('preparing', 'ready', 'served') NOT NULL DEFAULT 'preparing',
  estimated_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  estimated_ready_at DATETIME NOT NULL,
  ready_at           DATETIME NULL,
  created_by         BIGINT UNSIGNED NOT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_rounds_number (order_id, round_no),
  KEY idx_order_rounds_status_ready (order_id, status, estimated_ready_at),
  CONSTRAINT fk_order_rounds_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_order_rounds_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id          BIGINT UNSIGNED NOT NULL,
  round_id          BIGINT UNSIGNED NOT NULL,
  menu_item_id      INT UNSIGNED NOT NULL,
  item_name         VARCHAR(150) NOT NULL,
  unit_price        DECIMAL(10,2) NOT NULL,
  prep_time_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  quantity          SMALLINT UNSIGNED NOT NULL,
  line_total        DECIMAL(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  voided_at         DATETIME NULL,
  served_at         DATETIME NULL,
  is_meal           TINYINT(1) NOT NULL DEFAULT 0,
  remarks           VARCHAR(500) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_order_items_order (order_id, voided_at),
  KEY idx_order_items_round (round_id, voided_at),
  KEY idx_order_items_menu_item (menu_item_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_order_items_round FOREIGN KEY (round_id) REFERENCES order_rounds(id),
  CONSTRAINT fk_order_items_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  CONSTRAINT chk_order_items_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id   BIGINT UNSIGNED NOT NULL,
  method     ENUM('cash', 'card', 'online', 'other') NOT NULL,
  amount     DECIMAL(12,2) NOT NULL,
  reference  VARCHAR(100) NULL,
  received_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payments_order (order_id),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_payments_received_by FOREIGN KEY (received_by) REFERENCES users(id),
  CONSTRAINT chk_payments_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS activity_log (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id   BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  action     VARCHAR(64) NOT NULL,
  details    JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_log_order_date (order_id, created_at),
  KEY idx_activity_log_user_date (user_id, created_at),
  CONSTRAINT fk_activity_log_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_activity_log_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_purchases (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_name    VARCHAR(120) NOT NULL,
  quantity     DECIMAL(12,3) NOT NULL,
  unit         VARCHAR(24) NOT NULL,
  unit_cost    DECIMAL(10,2) NOT NULL,
  purchased_by BIGINT UNSIGNED NOT NULL,
  purchased_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_purchase_user FOREIGN KEY (purchased_by) REFERENCES users(id),
  CONSTRAINT chk_purchase_quantity CHECK (quantity > 0),
  CONSTRAINT chk_purchase_cost CHECK (unit_cost >= 0),
  INDEX idx_purchase_date (purchased_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS production_plan (
  menu_item_id INT UNSIGNED PRIMARY KEY,
  quantity     INT UNSIGNED NOT NULL DEFAULT 0,
  updated_by   BIGINT UNSIGNED NOT NULL,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_plan_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  CONSTRAINT fk_plan_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB;
