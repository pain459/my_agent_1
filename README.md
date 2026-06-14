# My Agent 1

A local OpenAI-backed agent workspace with persistent sessions, reviewed knowledge, Q/A memory, and separate chat/admin web pages.

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

The chat UI is at `/`. Administrative controls are separated at:

```text
http://localhost:3000/admin.html
```

`npm start` also runs the Python web backend.

The UI is the primary workspace, served by `py_backend/server.py`. The admin page contains training, knowledge, memory, logs, export, ingestion status, and guarded clear controls.

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

## Master Q/A Database

Sessions remain the raw JSON memory. The master Q/A database is a derived index at `.agent/qa-index.json` that extracts user question and assistant answer pairs from all sessions.

Build or rebuild it without starting chat:

```bash
npm run memory:build
```

During chat, exact repeated questions are answered from this master memory before making a new OpenAI API call. Similar questions are available through `/memory-search`, and broad patterns are visible through `/memory-stats`.

## Raw Knowledge and Training Export

The knowledge layer distills full chats into reusable items stored in `.agent/knowledge.json`. Extracted items start as `pending` so they can be reviewed before the agent relies on them.

Knowledge ingestion is tracked in `.agent/knowledge-ingestion.json`. A session is skipped once it is up to date, unless you enable force re-ingest from the admin page.

Approved knowledge is retrieved before OpenAI calls and injected into the prompt as known memory. Pending and rejected items are never used at runtime.

Export approved knowledge as JSONL for future fine-tuning preparation:

```bash
npm run training:export
```

The export writes `.agent/exports/training.jsonl`. It does not start a fine-tuning job.

## Deleting Memory

Delete individual knowledge items from the admin page. Larger clear operations are guarded by confirmation phrases. `memory` clears `.agent/knowledge.json`, `.agent/knowledge-ingestion.json`, and `.agent/qa-index.json`. `chats` clears `.agent/sessions/`. `all` does both.

## Project Structure

- `py_backend/server.py` serves the primary Python backend and web UI API.
- `py_backend/tools.py` provides command-line maintenance helpers.
- `public/index.html`, `public/app.js`, and `public/styles.css` implement the chat UI.
- `public/admin.html` and `public/admin.js` implement the admin UI.

## Notes

Runtime data under `.agent/` is private and ignored by git.
