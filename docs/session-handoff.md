# Session Handoff

Last updated: 2026-06-13

## Project State

This project is a local OpenAI-backed agent with a primary web UI and a Python backend (`py_backend/server.py`). The app uses no external runtime dependencies. The default model is `gpt-4o-mini` to keep LLM call costs low.

The web UI is now the main interface:

```bash
npm run web
```

Open:

```text
http://localhost:3000
```

`npm start` also runs the Python web backend.

## Core Features Built

- OpenAI Responses API client with configurable `OPENAI_API_KEY`, `OPENAI_MODEL`, and optional `OPENAI_REASONING_EFFORT`.
- Dynamic personas selected at session start.
- Persistent chat sessions stored as JSON under `.agent/sessions/`.
- Session gist/title metadata for easy identification.
- Knowledge candidates are extracted into `.agent/knowledge-review.json`.
- Approved knowledge is archived in `.agent/knowledge.json`.
- Runtime local answers and approved OpenAI context are served directly from `.agent/knowledge.json`.
- Rejected candidates move to `.agent/discard-bin.json` until discarded data is flushed.
- Knowledge ingestion ledger stored at `.agent/knowledge-ingestion.json`; unchanged sessions are skipped unless force re-ingest is enabled.
- Fine-tune preparation export writes approved knowledge to `.agent/exports/training.jsonl`.
- Guarded master clear commands can clear memory, chats, or all data with exact confirmation phrases.
- Web UI includes chat, sessions, personas, ingestion, review queue, active knowledge, discard bin, training export, admin clear controls, logs, dark/light mode, progress indicator, chat rename, and chat deletion.

## Important Files

- `py_backend/server.py` serves the primary web UI and JSON API.
- `py_backend/tools.py` provides maintenance helpers for training exports.
- `public/index.html`, `public/app.js`, `public/styles.css` implement the chat UI.
- `public/admin.html`, `public/admin.js` implement the admin UI.

## Verification

Run syntax checks:

```bash
npm run check
node --check public/app.js
node --check public/admin.js
```

Run the web UI:

```bash
npm run web
```

Stop the web server with `Ctrl-C`.

If port `3000` is occupied:

```bash
lsof -i :3000
kill <PID>
```

## Current Notes

- Runtime data under `.agent/` is git-ignored because it can contain private conversations and memory.
- Knowledge extraction requires an API key because it calls OpenAI.
- The current search approach is local keyword/Jaccard matching, not embeddings.
- Knowledge review is intentionally conservative: only approved items can be exported, used for local answers, or sent as OpenAI context.
- The web UI is dependency-free and served by the local Python HTTP server.

## Likely Next Work

- Add first-class Python tests instead of only syntax checks and smoke commands.
- Improve search quality with embeddings once local keyword search becomes too weak.
- Add a richer chat transcript viewer with message timestamps and source badges.
- Add export/import for sessions and approved knowledge.
- Add settings UI for model, port, and extraction model.
- Add pagination for sessions, logs, and knowledge once data grows.
