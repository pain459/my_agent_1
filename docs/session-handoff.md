# Session Handoff

Last updated: 2026-06-13

## Project State

This project is a local OpenAI-backed agent with both a CLI and a primary web UI. The app uses Node.js with no external runtime dependencies. The default model is `gpt-4o-mini` to keep LLM call costs low.

The web UI is now the main interface:

```bash
npm run web
```

Open:

```text
http://localhost:3000
```

The CLI still exists:

```bash
npm start
```

## Core Features Built

- OpenAI Responses API client with configurable `OPENAI_API_KEY`, `OPENAI_MODEL`, and optional `OPENAI_REASONING_EFFORT`.
- Dynamic personas selected at session start.
- Persistent chat sessions stored as JSON under `.agent/sessions/`.
- Session gist/title metadata for easy identification.
- Master Q/A memory index stored at `.agent/qa-index.json`.
- Exact repeated questions can be answered from Q/A memory before making a new OpenAI call.
- Raw knowledge extraction stored at `.agent/knowledge.json`.
- Knowledge items support `pending`, `approved`, and `rejected` review states.
- Approved knowledge is injected into runtime prompts as known memory.
- Fine-tune preparation export writes approved knowledge to `.agent/exports/training.jsonl`.
- Guarded master clear commands can clear memory, chats, or all data with exact confirmation phrases.
- Web UI includes chat, sessions, personas, Q/A memory tools, knowledge review, training export, admin clear controls, logs, dark/light mode, progress indicator, chat rename, and chat deletion.

## Important Files

- `src/webServer.js` serves the web UI and JSON API.
- `public/index.html`, `public/app.js`, `public/styles.css` implement the browser UI.
- `src/agent.js` owns chat behavior and prompt construction.
- `src/sessionStore.js` manages chat session JSON files.
- `src/qaStore.js` builds and searches direct Q/A memory.
- `src/knowledgeStore.js` manages reviewed reusable knowledge.
- `src/knowledgeExtractor.js` extracts knowledge candidates with `gpt-4o-mini`.
- `src/trainingExporter.js` exports approved knowledge to JSONL.
- `src/logger.js` writes JSON-line logs under `.agent/logs/app.log`.
- `src/personas.js` defines the available agent personalities.

## Verification

Run syntax checks:

```bash
npm run check
node --check public/app.js
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
- Knowledge review is intentionally conservative: only approved items are used at runtime or exported.
- The web UI is dependency-free and served by the local Node HTTP server.

## Likely Next Work

- Add first-class tests instead of only syntax checks and smoke commands.
- Improve search quality with embeddings once local keyword search becomes too weak.
- Add a richer chat transcript viewer with message timestamps and source badges.
- Add export/import for sessions, Q/A memory, and approved knowledge.
- Add settings UI for model, port, and extraction model.
- Add pagination for sessions, logs, and knowledge once data grows.
