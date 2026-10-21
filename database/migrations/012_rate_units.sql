-- How many units of each plot type a project has (NULL = not counted).
ALTER TABLE project_rates ADD COLUMN units INT NULL;
