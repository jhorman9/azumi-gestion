CREATE TABLE quotation_sequences (
  sequence_year SMALLINT UNSIGNED NOT NULL,
  next_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (sequence_year),
  CONSTRAINT chk_quotation_sequences_next_number CHECK (next_number > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('007_quotation_number_sequences', UTC_TIMESTAMP(3));
