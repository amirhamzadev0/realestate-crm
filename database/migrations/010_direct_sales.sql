-- A direct sale has no agent; buyer is optional for every sale.
ALTER TABLE sales
  MODIFY COLUMN agent_id VARCHAR(64) NULL,
  ADD COLUMN buyer VARCHAR(120) NULL;
