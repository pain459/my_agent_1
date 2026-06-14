# My Agent 1

A local OpenAI-backed agent workspace with persistent sessions, reviewed knowledge, active local knowledge search, and separate chat/admin web pages.

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

## Knowledge Pipeline

Knowledge has a controlled lifecycle:

```text
sessions -> review queue -> approved knowledge -> local answers or OpenAI context
```

- `.agent/knowledge-review.json` stores extracted candidates waiting for approval or rejection.
- `.agent/knowledge.json` stores approved knowledge that is active immediately after approval.
- `.agent/discard-bin.json` stores rejected candidates until you flush discarded data.
- `.agent/knowledge-ingestion.json` tracks which sessions were extracted and skips unchanged sessions unless force re-ingest is enabled.

When approved knowledge has a strong local match, the agent answers locally and marks the response source as `knowledge`. Medium-confidence matches are sent to OpenAI as approved context and marked as `openai-with-knowledge`. If there is no useful match, the agent calls OpenAI normally.

## Training Export

Export approved knowledge as JSONL for future fine-tuning preparation:

```bash
npm run training:export
```

The export writes `.agent/exports/training.jsonl`. It uses approved knowledge only and does not start a fine-tuning job.

## Deleting Memory

Rejecting a review candidate moves it to the discard bin. Flushing discarded data permanently clears rejected candidates. Larger clear operations are guarded by confirmation phrases. `memory` clears `.agent/knowledge-review.json`, `.agent/knowledge.json`, `.agent/discard-bin.json`, `.agent/knowledge-ingestion.json`, and legacy `.agent/memory.json` / `.agent/qa-index.json` if present. `chats` clears `.agent/sessions/`. `all` does both.

## Project Structure

- `py_backend/server.py` serves the primary Python backend and web UI API.
- `py_backend/tools.py` provides command-line maintenance helpers.
- `public/index.html`, `public/app.js`, and `public/styles.css` implement the chat UI.
- `public/admin.html` and `public/admin.js` implement the admin UI.

## Notes

Runtime data under `.agent/` is private and ignored by git.
