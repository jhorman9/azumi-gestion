ALTER TABLE daily_closings
  ADD COLUMN tips_total DECIMAL(12,2) NOT NULL DEFAULT 0.00
    AFTER gross_cash_total,
  ADD CONSTRAINT chk_daily_closings_tips_total CHECK (tips_total >= 0);

UPDATE daily_closings c
LEFT JOIN (
  SELECT daily_closing_id, SUM(amount) AS tips_total
  FROM daily_closing_tips
  GROUP BY daily_closing_id
) legacy_tips ON legacy_tips.daily_closing_id = c.id
SET c.tips_total = COALESCE(legacy_tips.tips_total, 0.00);

INSERT INTO audit_logs
  (actor_user_id, entity_type, entity_id, action, before_data, after_data, created_at)
SELECT
  NULL,
  'daily_closing',
  CAST(c.id AS CHAR),
  'cash_outflow_deduction_adjusted',
  JSON_OBJECT(
    'cash_total', c.cash_total,
    'reported_sales_total', c.reported_sales_total
  ),
  JSON_OBJECT(
    'cash_total', c.cash_total - outflows.outflow_total,
    'reported_sales_total', c.reported_sales_total - outflows.outflow_total,
    'cash_outflow_total', outflows.outflow_total
  ),
  UTC_TIMESTAMP(3)
FROM daily_closings c
INNER JOIN (
  SELECT daily_closing_id, SUM(amount) AS outflow_total
  FROM daily_closing_cash_outflows
  GROUP BY daily_closing_id
) outflows ON outflows.daily_closing_id = c.id
WHERE outflows.outflow_total > 0
  AND outflows.outflow_total <= c.cash_total
  AND outflows.outflow_total <= c.reported_sales_total;

UPDATE daily_closings c
INNER JOIN (
  SELECT daily_closing_id, SUM(amount) AS outflow_total
  FROM daily_closing_cash_outflows
  GROUP BY daily_closing_id
) outflows ON outflows.daily_closing_id = c.id
SET c.cash_total = c.cash_total - outflows.outflow_total,
    c.reported_sales_total = c.reported_sales_total - outflows.outflow_total
WHERE outflows.outflow_total > 0
  AND outflows.outflow_total <= c.cash_total
  AND outflows.outflow_total <= c.reported_sales_total;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('006_closing_outflows_and_daily_tips', UTC_TIMESTAMP(3));
