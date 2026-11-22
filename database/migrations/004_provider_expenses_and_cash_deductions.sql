ALTER TABLE expenses
  DROP FOREIGN KEY fk_expenses_category,
  DROP INDEX ix_expenses_category_incurred_on,
  DROP INDEX ix_expenses_status_due_on,
  DROP COLUMN category_id,
  DROP COLUMN expense_type,
  DROP COLUMN due_on,
  DROP COLUMN description,
  MODIFY supplier_id BIGINT UNSIGNED NOT NULL,
  MODIFY payment_method ENUM('cash', 'card', 'yappy') NOT NULL,
  MODIFY status ENUM('paid', 'void') NOT NULL DEFAULT 'paid',
  ADD COLUMN deduct_from_closing TINYINT(1) NOT NULL DEFAULT 0 AFTER payment_method,
  ADD COLUMN closing_operation_date DATE NULL AFTER deduct_from_closing,
  ADD KEY ix_expenses_closing_operation_date
    (closing_operation_date, status, deduct_from_closing),
  ADD CONSTRAINT chk_expenses_closing_deduction CHECK (
    (deduct_from_closing = 0 AND closing_operation_date IS NULL)
    OR (deduct_from_closing = 1 AND closing_operation_date IS NOT NULL)
  );

ALTER TABLE daily_closings
  ADD COLUMN gross_reported_sales_total DECIMAL(12,2) NOT NULL DEFAULT 0.00
    AFTER reported_sales_total,
  ADD COLUMN gross_cash_total DECIMAL(12,2) NOT NULL DEFAULT 0.00
    AFTER cash_total,
  ADD CONSTRAINT chk_daily_closings_gross_reported_sales_total
    CHECK (gross_reported_sales_total >= 0),
  ADD CONSTRAINT chk_daily_closings_gross_cash_total
    CHECK (gross_cash_total >= 0);

UPDATE daily_closings
SET gross_reported_sales_total = reported_sales_total,
    gross_cash_total = cash_total;

DROP TABLE expense_templates;
DROP TABLE expense_categories;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('004_provider_expenses_and_cash_deductions', UTC_TIMESTAMP(3));
