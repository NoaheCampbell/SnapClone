-- Add quiz_question_count column to sprints table
ALTER TABLE sprints ADD COLUMN quiz_question_count INTEGER DEFAULT 3; 