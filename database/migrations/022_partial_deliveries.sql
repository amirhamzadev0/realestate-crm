-- An order can arrive in parts: each delivery (date and quantity) is kept on the order.
ALTER TABLE material_requests ADD COLUMN deliveries JSON NULL;
