CREATE TABLE IF NOT EXISTS hawt_pos.inventory_purchases (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_name    VARCHAR(120) NOT NULL,
  quantity     DECIMAL(12,3) NOT NULL,
  unit         VARCHAR(24) NOT NULL,
  unit_cost    DECIMAL(10,2) NOT NULL,
  purchased_by BIGINT UNSIGNED NOT NULL,
  purchased_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_purchase_user FOREIGN KEY (purchased_by) REFERENCES hawt_pos.users(id),
  CONSTRAINT chk_purchase_quantity CHECK (quantity > 0),
  CONSTRAINT chk_purchase_cost CHECK (unit_cost >= 0),
  INDEX idx_purchase_date (purchased_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS hawt_pos.production_plan (
  menu_item_id INT UNSIGNED PRIMARY KEY,
  quantity     INT UNSIGNED NOT NULL DEFAULT 0,
  updated_by   BIGINT UNSIGNED NOT NULL,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_plan_item FOREIGN KEY (menu_item_id) REFERENCES hawt_pos.menu_items(id),
  CONSTRAINT fk_plan_user FOREIGN KEY (updated_by) REFERENCES hawt_pos.users(id)
) ENGINE=InnoDB;
