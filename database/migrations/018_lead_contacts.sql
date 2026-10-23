-- Every call or WhatsApp message an agent starts to a lead's client, so the agent and the manager can see how often it was tried.
CREATE TABLE IF NOT EXISTS lead_contacts (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  lead_id VARCHAR(64) NOT NULL,
  agent_id VARCHAR(64) NOT NULL,
  channel ENUM('call','whatsapp') NOT NULL,
  contacted_at DATETIME(3) NOT NULL,                 -- UTC
  KEY idx_contacts_lead (lead_id, contacted_at),
  CONSTRAINT fk_contacts_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_contacts_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
