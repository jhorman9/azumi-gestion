ALTER TABLE daily_closings
  ADD COLUMN cash_total DECIMAL(12,2) NOT NULL DEFAULT 0.00
    AFTER pedidos_ya_total,
  ADD CONSTRAINT chk_daily_closings_cash_total CHECK (cash_total >= 0);

INSERT INTO schema_migrations (version, applied_at)
VALUES ('003_closing_cash_total', UTC_TIMESTAMP(3));
