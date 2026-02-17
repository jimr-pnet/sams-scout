-- PropellerNet Agent Platform: Initial Schema
-- Migration 001: Create all briefing tables, enable pgvector, create indexes

-- =============================================================================
-- 1. Enable pgvector extension
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- 2. briefing_sources
--    Configured RSS feeds, podcast sites, YouTube channels
-- =============================================================================
CREATE TABLE briefing_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  url         text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('rss', 'podcast_transcript', 'youtube_channel')),
  category    text,
  active      boolean DEFAULT true,
  config      jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- =============================================================================
-- 3. briefing_search_queries
--    Standing queries for Claude web search
-- =============================================================================
CREATE TABLE briefing_search_queries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query      text NOT NULL,
  category   text,
  active     boolean DEFAULT true,
  added_by   text DEFAULT 'system' CHECK (added_by IN ('system', 'sam')),
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- 4. briefing_episodes
--    Generated daily episodes (created before briefing_raw_items due to FK)
-- =============================================================================
CREATE TABLE briefing_episodes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date                   date UNIQUE NOT NULL,
  script                 text,
  clean_script           text,
  audio_url              text,
  audio_duration_seconds numeric,
  summary                text,
  sections               jsonb,
  source_item_ids        uuid[],
  status                 text DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'delivered', 'failed')),
  created_at             timestamptz DEFAULT now(),
  metadata               jsonb DEFAULT '{}'
);

-- =============================================================================
-- 5. briefing_raw_items
--    Everything collected each day
-- =============================================================================
CREATE TABLE briefing_raw_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid REFERENCES briefing_sources(id),
  source_type     text NOT NULL CHECK (source_type IN ('rss', 'web_search', 'podcast_transcript', 'youtube_transcript')),
  title           text,
  url             text,
  content         text,
  content_snippet text,
  published_at    timestamptz,
  fetched_at      timestamptz DEFAULT now(),
  relevance_score numeric,
  episode_id      uuid REFERENCES briefing_episodes(id),
  metadata        jsonb DEFAULT '{}',
  embedded        boolean DEFAULT false
);

CREATE INDEX idx_raw_items_episode_id ON briefing_raw_items(episode_id);
CREATE INDEX idx_raw_items_source_id  ON briefing_raw_items(source_id);
CREATE INDEX idx_raw_items_fetched_at ON briefing_raw_items(fetched_at);

-- =============================================================================
-- 6. briefing_embeddings
--    pgvector knowledge base for semantic search
-- =============================================================================
CREATE TABLE briefing_embeddings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_item_id  uuid REFERENCES briefing_raw_items(id),
  episode_id   uuid REFERENCES briefing_episodes(id),
  content_type text NOT NULL CHECK (content_type IN ('source_chunk', 'episode_script')),
  chunk_text   text NOT NULL,
  chunk_index  integer,
  embedding    vector(1024),
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_embeddings_raw_item_id ON briefing_embeddings(raw_item_id);
CREATE INDEX idx_embeddings_episode_id  ON briefing_embeddings(episode_id);

-- HNSW index for cosine similarity search
-- HNSW chosen over IVFFlat: no training step needed, works on empty tables
CREATE INDEX idx_embeddings_hnsw ON briefing_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- 7. Storage bucket for audio files
--    NOTE: Create via Supabase Dashboard or JS client:
--    supabase.storage.createBucket('briefing-audio', { public: true })
-- =============================================================================
