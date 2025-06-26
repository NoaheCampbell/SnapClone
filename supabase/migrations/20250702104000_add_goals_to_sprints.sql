-- Add goals column to sprints table
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS goals TEXT; 