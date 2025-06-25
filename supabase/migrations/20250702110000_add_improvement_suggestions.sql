-- Add improvement_suggestions column to quiz_attempts table
ALTER TABLE quiz_attempts 
ADD COLUMN improvement_suggestions text[]; 