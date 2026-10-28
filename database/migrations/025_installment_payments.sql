-- Each payment received on an instalment (date and amount) is kept, so its ledger can show how it was paid.
ALTER TABLE installments ADD COLUMN payments JSON NULL;
