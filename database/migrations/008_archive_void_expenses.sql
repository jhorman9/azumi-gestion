ALTER TABLE expenses
  ADD COLUMN archived_at DATETIME(3) NULL AFTER voided_at,
  ADD KEY ix_expenses_archived_incurred (archived_at, incurred_on, id),
  ADD CONSTRAINT chk_expenses_archived_only_when_void
    CHECK (archived_at IS NULL OR status = 'void');

INSERT INTO schema_migrations (version, applied_at)
VALUES ('008_archive_void_expenses', UTC_TIMESTAMP(3));
