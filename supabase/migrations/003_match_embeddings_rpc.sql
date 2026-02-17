-- PropellerNet Agent Platform: Semantic Search RPC
-- Migration 003: Create match_embeddings function for pgvector similarity search

CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  raw_item_id uuid,
  episode_id uuid,
  content_type text,
  chunk_text text,
  chunk_index integer,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.raw_item_id,
    e.episode_id,
    e.content_type,
    e.chunk_text,
    e.chunk_index,
    e.metadata,
    e.created_at,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM briefing_embeddings e
  WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
