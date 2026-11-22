UPDATE users
SET is_active = 0,
    updated_at = UTC_TIMESTAMP(3)
WHERE user_role = 'menu_editor'
  AND is_active = 1;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('005_retire_menu_editor_accounts', UTC_TIMESTAMP(3));
