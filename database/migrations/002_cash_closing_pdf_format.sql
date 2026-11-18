ALTER TABLE daily_closings
  ADD COLUMN pedidos_ya_total DECIMAL(12,2) NOT NULL DEFAULT 0.00
    AFTER reported_sales_total,
  ADD CONSTRAINT chk_daily_closings_pedidos_ya_total
    CHECK (pedidos_ya_total >= 0);

CREATE TABLE daily_closing_channel_payments (
  daily_closing_id BIGINT UNSIGNED NOT NULL,
  payment_type ENUM('credit_card', 'clave') NOT NULL,
  payment_channel ENUM('pos', 'bac', 'banesco', 'yappy', 'ach') NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (daily_closing_id, payment_type, payment_channel),
  CONSTRAINT chk_daily_closing_channel_payments_amount CHECK (amount >= 0),
  CONSTRAINT fk_daily_closing_channel_payments_closing
    FOREIGN KEY (daily_closing_id) REFERENCES daily_closings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_closing_cash_outflows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  daily_closing_id BIGINT UNSIGNED NOT NULL,
  line_number TINYINT UNSIGNED NOT NULL,
  description VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_closing_cash_outflows_line (daily_closing_id, line_number),
  CONSTRAINT chk_daily_closing_cash_outflows_line CHECK (line_number BETWEEN 1 AND 6),
  CONSTRAINT chk_daily_closing_cash_outflows_amount CHECK (amount > 0),
  CONSTRAINT fk_daily_closing_cash_outflows_closing
    FOREIGN KEY (daily_closing_id) REFERENCES daily_closings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_closing_tips (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  daily_closing_id BIGINT UNSIGNED NOT NULL,
  line_number TINYINT UNSIGNED NOT NULL,
  recipient_name VARCHAR(120) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_closing_tips_line (daily_closing_id, line_number),
  CONSTRAINT chk_daily_closing_tips_line CHECK (line_number BETWEEN 1 AND 5),
  CONSTRAINT chk_daily_closing_tips_amount CHECK (amount > 0),
  CONSTRAINT fk_daily_closing_tips_closing
    FOREIGN KEY (daily_closing_id) REFERENCES daily_closings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('002_cash_closing_pdf_format', UTC_TIMESTAMP(3));
