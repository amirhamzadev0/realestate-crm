-- There is no central warehouse stock any more: material is ordered for a project and goes straight into its inventory.
DELETE FROM stock_items WHERE scope = 'warehouse';

ALTER TABLE stock_items DROP INDEX uq_stock_location;
ALTER TABLE stock_items
  DROP COLUMN project_key,
  DROP COLUMN scope,
  MODIFY COLUMN project_id VARCHAR(64) NOT NULL,
  ADD UNIQUE KEY uq_stock_item (project_id, material_id);

-- "approved" is replaced by "ordered": approving a request places the order.
ALTER TABLE material_requests
  MODIFY COLUMN status ENUM('pending','approved','ordered','rejected','fulfilled') NOT NULL DEFAULT 'pending';
UPDATE material_requests SET status = 'ordered' WHERE status = 'approved';
ALTER TABLE material_requests
  MODIFY COLUMN status ENUM('pending','ordered','rejected','fulfilled') NOT NULL DEFAULT 'pending',
  ADD COLUMN ordered_at DATE NULL,
  ADD COLUMN received_at DATE NULL;
UPDATE material_requests SET ordered_at = decided_at WHERE status IN ('ordered', 'fulfilled');
UPDATE material_requests SET received_at = decided_at WHERE status = 'fulfilled';
