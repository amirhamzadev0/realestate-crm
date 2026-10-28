-- Each payment to a vendor (date and amount) is kept on the order, so a month's record can show when money was paid.
ALTER TABLE material_requests ADD COLUMN payments JSON NULL;
