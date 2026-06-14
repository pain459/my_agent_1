# My Agent 1

A local OpenAI-backed agent workspace with persistent sessions, session-context retrieval, and separate chat/stats web pages.

## Requirements

- Node.js 20 or newer
- An OpenAI API key

## Setup

```bash
cp .env.example .env
```

Edit `.env` and set `OPENAI_API_KEY`.

You can also export variables in your shell instead:

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_MODEL="gpt-4o-mini"
```

`OPENAI_REASONING_EFFORT` is optional and should only be set for models that support reasoning options.

## Run

Web UI:

```bash
npm run web
```

Open `http://localhost:3000`.

The chat UI is at `/`. Chat stats and diagnostics are at:

```text
http://localhost:3000/admin.html
```

`npm start` also runs the Python web backend.

The UI is the primary workspace, served by `py_backend/server.py`. The stats page shows session counts, message counts, persona activity, session-context index diagnostics, logs, and guarded clear controls.

## Personas

When creating a chat session, choose which type of agent you want. A persona controls the agent's behavior for that conversation and is stored with the session.

Available personas:

```text
general     General Assistant
engineer    Senior Software Engineer
researcher  Research Analyst
writer      Writing Coach
product     Product Strategist
teacher     Patient Tutor
ops         Operations Planner
coach       Reflective Coach
```

## Sessions and Memory

Every chat is saved as a local session under `.agent/sessions/`. Session files are ignored by git because they may contain private conversation data.

## Session Context

Sessions are the memory source of truth:

```text
sessions -> session context index -> relevant prior context -> OpenAI answer
```

- `.agent/sessions/` stores raw chat sessions.
- `.agent/session-index.json` stores searchable user/assistant conversation chunks.
- The index is updated after each chat exchange and can be rebuilt from the stats page.

When a user asks a question, the backend searches prior session chunks. If relevant chunks are found, they are sent to OpenAI as context and the response source is `openai-with-session-context`. If no useful chunks are found, the response source is `openai`.

## Deleting Memory

Larger clear operations are guarded by confirmation phrases. `memory` clears legacy knowledge/memory files. `chats` clears `.agent/sessions/` and `.agent/session-index.json`. `all` does both.

## Project Structure

- `py_backend/server.py` serves the primary Python backend and web UI API.
- `py_backend/tools.py` provides command-line maintenance helpers.
- `public/index.html`, `public/app.js`, and `public/styles.css` implement the chat UI.
- `public/admin.html` and `public/admin.js` implement the admin UI.

## Notes

Runtime data under `.agent/` is private and ignored by git.
