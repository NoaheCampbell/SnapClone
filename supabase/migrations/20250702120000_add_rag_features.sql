-- Add RAG (Retrieval-Augmented Generation) features with pgvector
BEGIN;

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to summaries table for RAG
ALTER TABLE summaries 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add tags column to summaries for topic-based retrieval
ALTER TABLE summaries 
ADD COLUMN IF NOT EXISTS tags text[];

-- Add missed_concepts column to quiz_attempts to track what user got wrong
ALTER TABLE quiz_attempts 
ADD COLUMN IF NOT EXISTS missed_concepts text[];

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS summaries_embedding_idx ON summaries 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index for tag-based filtering
CREATE INDEX IF NOT EXISTS summaries_tags_idx ON summaries USING GIN (tags);

-- Create index for user-specific summary retrieval
CREATE INDEX IF NOT EXISTS summaries_user_idx ON summaries (sprint_id);

-- Add concept_map_data column to store Mermaid diagram data
ALTER TABLE summaries 
ADD COLUMN IF NOT EXISTS concept_map_data text;

-- Create function to find similar summaries using vector search
CREATE OR REPLACE FUNCTION find_similar_summaries(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_tags text[] DEFAULT NULL,
  exclude_sprint_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  sprint_id uuid,
  bullets text[],
  tags text[],
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.sprint_id,
    s.bullets,
    s.tags,
    (1 - (s.embedding <=> query_embedding)) as similarity,
    s.created_at
  FROM summaries s
  WHERE 
    s.embedding IS NOT NULL
    AND (1 - (s.embedding <=> query_embedding)) > match_threshold
    AND (filter_tags IS NULL OR s.tags && filter_tags)
    AND (exclude_sprint_id IS NULL OR s.sprint_id != exclude_sprint_id)
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create function to get user's recent summaries for gap-aware quiz generation
CREATE OR REPLACE FUNCTION get_user_recent_summaries_with_missed_concepts(
  p_user_id uuid,
  p_tags text[] DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  summary_id uuid,
  sprint_topic text,
  summary_bullets text[],
  summary_tags text[],
  missed_concepts text[],
  quiz_score int,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as summary_id,
    sp.topic as sprint_topic,
    s.bullets as summary_bullets,
    s.tags as summary_tags,
    COALESCE(qa.missed_concepts, ARRAY[]::text[]) as missed_concepts,
    COALESCE(qa.score, 0) as quiz_score,
    s.created_at
  FROM summaries s
  INNER JOIN sprints sp ON s.sprint_id = sp.id
  LEFT JOIN quizzes q ON q.summary_id = s.id
  LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.user_id = p_user_id
  WHERE 
    sp.user_id = p_user_id
    AND (p_tags IS NULL OR s.tags && p_tags)
  ORDER BY s.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Create function to generate next topic suggestions based on user's study history
CREATE OR REPLACE FUNCTION get_next_topic_suggestion_data(
  p_user_id uuid
)
RETURNS TABLE (
  recent_topics text[],
  recent_tags text[],
  current_streak int,
  best_streak int,
  weak_areas text[],
  strong_areas text[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH recent_sprints AS (
    SELECT sp.topic, s.tags, qa.score
    FROM sprints sp
    LEFT JOIN summaries s ON s.sprint_id = sp.id
    LEFT JOIN quizzes q ON q.summary_id = s.id
    LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.user_id = p_user_id
    WHERE sp.user_id = p_user_id
    ORDER BY sp.created_at DESC
    LIMIT 20
  ),
  streak_data AS (
    SELECT current_len, best_len
    FROM streaks
    WHERE user_id = p_user_id
  ),
  performance_analysis AS (
    SELECT 
      ARRAY_AGG(DISTINCT topic) FILTER (WHERE score < 60) as weak_topics,
      ARRAY_AGG(DISTINCT topic) FILTER (WHERE score >= 80) as strong_topics
    FROM recent_sprints
    WHERE score IS NOT NULL
  )
  SELECT 
    ARRAY_AGG(DISTINCT rs.topic) as recent_topics,
    ARRAY_AGG(DISTINCT tag) FILTER (WHERE tag IS NOT NULL) as recent_tags,
    COALESCE(sd.current_len, 0) as current_streak,
    COALESCE(sd.best_len, 0) as best_streak,
    COALESCE(pa.weak_topics, ARRAY[]::text[]) as weak_areas,
    COALESCE(pa.strong_topics, ARRAY[]::text[]) as strong_areas
  FROM recent_sprints rs
  CROSS JOIN streak_data sd
  CROSS JOIN performance_analysis pa
  CROSS JOIN UNNEST(COALESCE(rs.tags, ARRAY[]::text[])) as tag
  GROUP BY sd.current_len, sd.best_len, pa.weak_topics, pa.strong_topics;
END;
$$;

COMMIT; 