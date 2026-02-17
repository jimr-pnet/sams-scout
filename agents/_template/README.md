# Agent Template

Copy this directory to create a new agent.

## Steps

1. Copy `_template/` to a new directory: `cp -r _template/ my-agent/`
2. Update `meta` in `index.js` with your agent's name, description, and basePath
3. Add your routes to the router
4. Add shared lib imports as needed (`../lib/supabase`, `../lib/claude`, etc.)
5. Deploy — the agent registry will auto-discover your agent

## Required Exports

Your `index.js` must export:
- `router` — an Express Router instance
- `meta` — `{ name: string, description: string, basePath: string }`
