# PropellerNet Agent Platform

## Overview

This is PropellerNet's shared agent platform — an Express.js backend on Railway that hosts multiple AI agents. The first agent is Sam's Morning Briefing: a daily audio intelligence briefing on agentic commerce and marketing disruption.

## Stack

- **Runtime**: Node.js / Express.js
- **Hosting**: Railway
- **Database**: Supabase (Postgres + pgvector + Auth + Storage)
- **AI**: Claude API (Anthropic) via @anthropic-ai/sdk
- **Web research**: Claude API with web_search tool
- **TTS**: ElevenLabs API
- **Frontend**: Separate Lovable app (not in this repo)
- **Notifications**: Slack webhooks

## Architecture

### Agent Registry Pattern

Each agent lives in `/agents/{name}/` and exports an Express router plus metadata. The registry in `/agents/index.js` auto-discovers and mounts them. To add a new agent: copy `/agents/_template/`, implement your logic, deploy. No changes to server.js needed.

### Shared Libraries

All agents share utilities in `/lib/`:
- `supabase.js` — Supabase client
- `claude.js` — Claude API wrapper with retries, token logging, cost tracking
- `elevenlabs.js` — ElevenLabs TTS wrapper
- `embeddings.js` — embedding generation + pgvector storage
- `slack.js` — Slack notification helper
- `logger.js` — structured logging

## First Agent: Morning Briefing

### What It Does

Every weekday at 5am GMT, a cron job triggers a pipeline that:

1. **Collects sources** (in parallel):
   - RSS feeds (news sites, Substacks, company blogs) via `rss-parser`
   - Claude web search with standing queries and `web_search_20250305` tool
   - Podcast transcripts scraped from websites via `cheerio`
   - YouTube transcripts via YouTube Data API
   
2. **Scores and filters**: Single Claude call scores all items 0-10 for relevance. Top 8-12 survive.

3. **Writes a script**: Claude generates a 5-8 minute spoken-word briefing with inline `[source: {id}]` markers for citation linking.

4. **Generates audio**: ElevenLabs TTS converts the clean script (markers stripped) to MP3.

5. **Embeds everything**: Raw items and the script get chunked and embedded into pgvector for the knowledge base.

6. **Publishes**: Episode record created in Supabase, audio uploaded to Supabase Storage, Slack notification sent.

### Script Structure

The briefing follows this structure:
- **Opener** (10-15 sec) — single sentence setting the tone
- **Today's Three** (3-4 min) — two or three key developments with PropellerNet implications
- **The Deeper Thread** (1-2 min) — a bigger strategic pattern or question
- **Opportunity Spot** (30-60 sec, optional) — specific client/biz dev angle if applicable
- **Closer** (10-15 sec) — brief sign-off

### Script Formatting for TTS

Critical rules for ElevenLabs quality:
- All numbers as words: "sixty" not "60"
- Abbreviations in full first use, then spaced: "A I"
- URLs phonetically: "shopify dot com slash partners"
- Em dashes for mid-sentence pauses
- Short to medium sentences
- No formatting, bullets, headers, or ellipses
- CAPS sparingly for emphasis

### API Endpoints

```
GET  /api/briefing/episodes              — paginated episode list
GET  /api/briefing/episodes/latest       — today's episode
GET  /api/briefing/episodes/:id          — full episode with sections + sources
GET  /api/briefing/audio/:id.mp3         — audio file streaming
POST /api/briefing/chat                  — knowledge base chat (semantic search + Claude)
GET  /api/briefing/queries               — list standing search queries
POST /api/briefing/queries               — add a standing query
DELETE /api/briefing/queries/:id         — remove a standing query
POST /api/briefing/generate              — manual pipeline trigger
```

## Database Schema

### Tables

**briefing_sources** — configured RSS feeds, podcast sites, YouTube channels
- id, name, url, source_type ('rss', 'podcast_transcript', 'youtube_channel'), category, active, config (JSONB), created_at

**briefing_search_queries** — standing queries for Claude web search
- id, query, category, active, added_by ('system' or 'sam'), created_at

**briefing_raw_items** — everything collected each day
- id, source_id, source_type ('rss', 'web_search', 'podcast_transcript', 'youtube_transcript'), title, url, content, content_snippet, published_at, fetched_at, relevance_score, episode_id, metadata (JSONB), embedded (boolean)

**briefing_episodes** — generated daily episodes
- id, date (unique), script, clean_script, audio_url, audio_duration_seconds, summary, sections (JSONB), source_item_ids (UUID[]), status ('pending', 'generated', 'delivered', 'failed'), created_at, metadata (JSONB)

**briefing_embeddings** — pgvector knowledge base
- id, raw_item_id, episode_id, content_type ('source_chunk', 'episode_script'), chunk_text, chunk_index, embedding (VECTOR(1024)), metadata (JSONB), created_at

### Sections JSONB Structure

```json
[
  { "label": "opener", "title": null, "word_index": 0, "estimated_timestamp_seconds": 0, "source_ids": [] },
  { "label": "story_1", "title": "Short title", "word_index": 45, "estimated_timestamp_seconds": 18, "source_ids": ["uuid"] },
  { "label": "deeper_thread", "title": "Short title", "word_index": 520, "estimated_timestamp_seconds": 208, "source_ids": ["uuid"] }
]
```

## Environment Variables

```
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=
BRIEFING_VOICE_ID=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
YOUTUBE_API_KEY=
SLACK_WEBHOOK_URL=
BRIEFING_CRON=0 5 * * 1-5
PORT=3000
```

## File Structure

```
/server.js
/middleware/
  auth.js
  errorHandler.js
/lib/
  supabase.js
  claude.js
  elevenlabs.js
  embeddings.js
  slack.js
  logger.js
/agents/
  index.js
  briefing/
    index.js
    pipeline.js
    sources/
      rss.js
      search.js
      podcasts.js
      youtube.js
    scorer.js
    scriptWriter.js
    tts.js
    chat.js
    prompts/
      scoring.txt
      script.txt
      chat.txt
      context.txt
  _template/
    index.js
    README.md
/package.json
```

## Key Dependencies

- express
- @anthropic-ai/sdk
- @supabase/supabase-js
- rss-parser
- cheerio
- node-cron
- dotenv

## PropellerNet Context

PropellerNet is a 60-person digital PR and marketing agency in Brighton, UK. Services: SEO, digital PR, paid media (Google Ads, Meta), content marketing. Business model heavily Google-dependent. Key clients include Turner & Townsend.

Sam (MD) is focused on how agentic commerce and AI-mediated discovery will disrupt the Google-centric marketing model. The briefing exists to keep him at the cutting edge of this shift and spot opportunities for PropellerNet to reposition.

## Build Order

1. Supabase — all tables, pgvector extension, storage bucket for audio
2. Shared backend scaffold — Express, agent registry, shared libs, deploy to Railway
3. Source collection — RSS, Claude web search, YouTube transcripts, podcast transcripts. Seed source and query tables.
4. Scoring and script generation — both Claude API calls with full prompts
5. TTS — ElevenLabs integration, audio upload to Supabase Storage
6. Pipeline orchestration — wire everything into single pipeline function, cron job, Slack notification
7. Embedding pipeline — chunk, embed, store in pgvector
8. API endpoints — all routes for the Lovable frontend to consume
9. Test — manual trigger, verify end to end
