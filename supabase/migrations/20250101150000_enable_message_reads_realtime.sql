-- Migration: Enable realtime for message_reads table
-- This ensures that read receipt changes are broadcasted in real-time

-- Add message_reads table to realtime publication
alter publication supabase_realtime add table message_reads; 