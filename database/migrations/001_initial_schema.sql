CREATE TABLE schema_migrations (
  version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  applied_at DATETIME(3) NOT NULL,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  user_role ENUM('admin', 'manager', 'menu_editor') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash BINARY(32) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
  KEY ix_auth_sessions_user_expires (user_id, expires_at),
  KEY ix_auth_sessions_expires (expires_at),
  CONSTRAINT fk_auth_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempt_limits (
  account_hash BINARY(32) NOT NULL,
  window_started_at DATETIME(3) NOT NULL,
  failed_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (account_hash),
  KEY ix_login_attempt_limits_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_closings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  operation_date DATE NOT NULL,
  reported_sales_total DECIMAL(12,2) NOT NULL,
  status ENUM('draft', 'confirmed', 'corrected') NOT NULL DEFAULT 'draft',
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  confirmed_by BIGINT UNSIGNED NULL,
  confirmed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_closings_operation_date (operation_date),
  KEY ix_daily_closings_status_date (status, operation_date),
  CONSTRAINT chk_daily_closings_reported_sales_total CHECK (reported_sales_total >= 0),
  CONSTRAINT chk_daily_closings_confirmation CHECK (
    (status = 'draft' AND confirmed_by IS NULL AND confirmed_at IS NULL)
    OR (
      status IN ('confirmed', 'corrected')
      AND confirmed_by IS NOT NULL
      AND confirmed_at IS NOT NULL
    )
  ),
  CONSTRAINT fk_daily_closings_created_by
    FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_daily_closings_confirmed_by
    FOREIGN KEY (confirmed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_closing_payments (
  daily_closing_id BIGINT UNSIGNED NOT NULL,
  payment_method ENUM('cash', 'card', 'transfer', 'other') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (daily_closing_id, payment_method),
  CONSTRAINT chk_daily_closing_payments_amount CHECK (amount >= 0),
  CONSTRAINT fk_daily_closing_payments_closing
    FOREIGN KEY (daily_closing_id) REFERENCES daily_closings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_closing_adjustments (
  daily_closing_id BIGINT UNSIGNED NOT NULL,
  adjustment_type ENUM('discounts', 'refunds', 'taxes', 'tips') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  treatment ENUM('included', 'excluded') NOT NULL,
  PRIMARY KEY (daily_closing_id, adjustment_type),
  CONSTRAINT chk_daily_closing_adjustments_amount CHECK (amount >= 0),
  CONSTRAINT fk_daily_closing_adjustments_closing
    FOREIGN KEY (daily_closing_id) REFERENCES daily_closings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expense_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_expense_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_name VARCHAR(190) NOT NULL,
  contact_name VARCHAR(120) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_suppliers_legal_name (legal_name),
  KEY ix_suppliers_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE purchase_bills (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_id BIGINT UNSIGNED NOT NULL,
  invoice_reference VARCHAR(100) NULL,
  issue_date DATE NOT NULL,
  due_date DATE NULL,
  amount DECIMAL(12,2) NOT NULL,
  status ENUM('open', 'void') NOT NULL DEFAULT 'open',
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchase_bills_supplier_reference (supplier_id, invoice_reference),
  KEY ix_purchase_bills_due_status (status, due_date),
  KEY ix_purchase_bills_supplier_issue_date (supplier_id, issue_date),
  CONSTRAINT chk_purchase_bills_amount CHECK (amount > 0),
  CONSTRAINT fk_purchase_bills_supplier
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT fk_purchase_bills_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NULL,
  expense_type ENUM('fixed', 'variable') NOT NULL,
  incurred_on DATE NOT NULL,
  due_on DATE NULL,
  amount DECIMAL(12,2) NOT NULL,
  description VARCHAR(500) NOT NULL,
  status ENUM('unpaid', 'paid', 'void') NOT NULL DEFAULT 'unpaid',
  payment_method ENUM('cash', 'card', 'transfer', 'other') NULL,
  paid_at DATETIME(3) NULL,
  voided_at DATETIME(3) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_expenses_incurred_on (incurred_on),
  KEY ix_expenses_status_due_on (status, due_on),
  KEY ix_expenses_category_incurred_on (category_id, incurred_on),
  KEY ix_expenses_supplier (supplier_id),
  CONSTRAINT chk_expenses_amount CHECK (amount > 0),
  CONSTRAINT fk_expenses_category
    FOREIGN KEY (category_id) REFERENCES expense_categories (id),
  CONSTRAINT fk_expenses_supplier
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT fk_expenses_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expense_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NULL,
  expense_type ENUM('fixed', 'variable') NOT NULL,
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  recurrence_unit ENUM('week', 'month', 'year') NOT NULL,
  recurrence_interval SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  next_occurrence_on DATE NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_expense_templates_active_next_date (is_active, next_occurrence_on),
  CONSTRAINT chk_expense_templates_amount CHECK (amount > 0),
  CONSTRAINT chk_expense_templates_interval CHECK (recurrence_interval > 0),
  CONSTRAINT fk_expense_templates_category
    FOREIGN KEY (category_id) REFERENCES expense_categories (id),
  CONSTRAINT fk_expense_templates_supplier
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT fk_expense_templates_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bill_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_bill_id BIGINT UNSIGNED NOT NULL,
  paid_at DATETIME(3) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('cash', 'card', 'transfer', 'other') NOT NULL,
  reference VARCHAR(120) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_bill_payments_bill_paid_at (purchase_bill_id, paid_at),
  CONSTRAINT chk_bill_payments_amount CHECK (amount > 0),
  CONSTRAINT fk_bill_payments_purchase_bill
    FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bills (id),
  CONSTRAINT fk_bill_payments_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE menu_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_menu_categories_slug (slug),
  KEY ix_menu_categories_visible_order (is_visible, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE menu_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  description TEXT NULL,
  image_path VARCHAR(500) NULL,
  base_price DECIMAL(12,2) NOT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_menu_items_slug (slug),
  KEY ix_menu_items_category_order (category_id, is_available, sort_order),
  CONSTRAINT chk_menu_items_base_price CHECK (base_price >= 0),
  CONSTRAINT fk_menu_items_category
    FOREIGN KEY (category_id) REFERENCES menu_categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE promotions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  kind ENUM('percentage', 'fixed_price') NOT NULL,
  value DECIMAL(12,2) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_promotions_active_window (is_active, starts_at, ends_at),
  CONSTRAINT chk_promotions_window CHECK (ends_at > starts_at),
  CONSTRAINT chk_promotions_value CHECK (
    (kind = 'percentage' AND value > 0 AND value <= 100)
    OR (kind = 'fixed_price' AND value >= 0)
  ),
  CONSTRAINT fk_promotions_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE promotion_item_targets (
  promotion_id BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (promotion_id, menu_item_id),
  KEY ix_promotion_item_targets_item (menu_item_id),
  CONSTRAINT fk_promotion_item_targets_promotion
    FOREIGN KEY (promotion_id) REFERENCES promotions (id),
  CONSTRAINT fk_promotion_item_targets_item
    FOREIGN KEY (menu_item_id) REFERENCES menu_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE promotion_category_targets (
  promotion_id BIGINT UNSIGNED NOT NULL,
  menu_category_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (promotion_id, menu_category_id),
  KEY ix_promotion_category_targets_category (menu_category_id),
  CONSTRAINT fk_promotion_category_targets_promotion
    FOREIGN KEY (promotion_id) REFERENCES promotions (id),
  CONSTRAINT fk_promotion_category_targets_category
    FOREIGN KEY (menu_category_id) REFERENCES menu_categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  action VARCHAR(80) NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_audit_logs_entity (entity_type, entity_id, created_at),
  KEY ix_audit_logs_actor_created_at (actor_user_id, created_at),
  CONSTRAINT fk_audit_logs_actor
    FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('001_initial_schema', UTC_TIMESTAMP(3));
