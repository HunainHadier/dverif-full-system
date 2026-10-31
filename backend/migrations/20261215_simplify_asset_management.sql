-- Remove the asset taxonomy and legacy identity fields after the application no longer depends on them.
-- Asset records themselves, including names, purchase details, assignments and maintenance history, are preserved.
DROP TRIGGER IF EXISTS bi_asset_categories_uuid;

ALTER TABLE assets
  DROP FOREIGN KEY fk_assets_category_same_org,
  DROP INDEX fk_assets_category_same_org,
  DROP INDEX idx_assets_category,
  DROP INDEX idx_assets_serial,
  DROP INDEX uk_assets_org_tag,
  DROP COLUMN category_uuid,
  DROP COLUMN asset_tag,
  DROP COLUMN model_details,
  DROP COLUMN serial_number;

DROP TABLE asset_categories;
