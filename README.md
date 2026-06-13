# My Agent 1

A small command-line agent foundation. It talks with you in the terminal, keeps the current conversation in memory, and calls the OpenAI Responses API.

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

CLI:

```bash
npm start
```

The UI is the primary workspace. The CLI remains available for terminal use. Choose the agent persona when the program starts, then type your message and press Enter. Use `/exit` to quit, `/clear` to reset conversation memory, and `/help` to see commands.

## Personas

At startup, the CLI asks which type of agent you want for the session. A persona controls the agent's behavior for that conversation and is stored with the session. There is no command to change persona in the middle of an active conversation.

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

Useful commands:

```text
/memory-build Rebuild the master Q/A database from all sessions.
/memory-search <question>
              Search prior Q/A records for similar questions.
/memory-stats Show record count, repeated questions, and common keywords.
/knowledge-build [session-id]
              Extract pending reusable knowledge from all sessions or one session.
/knowledge-list [pending|approved|rejected]
              List extracted knowledge items for review.
/knowledge-approve <id>
              Approve a pending knowledge item for runtime use and export.
/knowledge-reject <id>
              Reject a pending knowledge item.
/knowledge-delete <id>
              Permanently delete one knowledge item.
/knowledge-search <query>
              Search approved reusable knowledge.
/master-clear memory CONFIRM_CLEAR_MEMORY
              Clear reusable knowledge and the master Q/A index.
/master-clear chats CONFIRM_CLEAR_CHATS
              Clear saved chat sessions and start a fresh session.
/master-clear all CONFIRM_CLEAR_ALL
              Clear both memory and saved chat sessions.
/session      Show the active session id, gist, and timestamps.
/sessions     List recent saved sessions with short gists.
/use <id>     Resume a saved session.
/new          Start a fresh session with the startup persona.
/clear        Clear messages in the active session.
```

## Master Q/A Database

Sessions remain the raw JSON memory. The master Q/A database is a derived index at `.agent/qa-index.json` that extracts user question and assistant answer pairs from all sessions.

Build or rebuild it without starting chat:

```bash
npm run memory:build
```

During chat, exact repeated questions are answered from this master memory before making a new OpenAI API call. Similar questions are available through `/memory-search`, and broad patterns are visible through `/memory-stats`.

## Raw Knowledge and Training Export

The knowledge layer distills full chats into reusable items stored in `.agent/knowledge.json`. Extracted items start as `pending` so they can be reviewed before the agent relies on them.

Build pending knowledge during chat:

```text
/knowledge-build
```

Approve useful items:

```text
/knowledge-list pending
/knowledge-approve <id>
```

Approved knowledge is retrieved before OpenAI calls and injected into the prompt as known memory. Pending and rejected items are never used at runtime.

Export approved knowledge as JSONL for future fine-tuning preparation:

```bash
npm run training:export
```

The export writes `.agent/exports/training.jsonl`. It does not start a fine-tuning job.

## Deleting Memory

Delete one knowledge item:

```text
/knowledge-delete <id>
```

Clear larger areas with the guarded master command:

```text
/master-clear memory CONFIRM_CLEAR_MEMORY
/master-clear chats CONFIRM_CLEAR_CHATS
/master-clear all CONFIRM_CLEAR_ALL
```

`memory` clears `.agent/knowledge.json` and `.agent/qa-index.json`. `chats` clears `.agent/sessions/` and starts a fresh active session. `all` does both.

## Project Structure

- `src/cli.js` runs the interactive terminal loop.
- `src/agent.js` owns conversation state and agent behavior.
- `src/openaiClient.js` wraps OpenAI API calls.
- `src/personas.js` defines available agent personalities.
- `src/knowledgeStore.js` stores reviewed reusable knowledge.
- `src/knowledgeExtractor.js` extracts knowledge candidates from chat sessions.
- `src/qaStore.js` builds and searches the master Q/A database.
- `src/config.js` loads environment configuration.

## Notes

This first version intentionally has a narrow surface area. Future features can plug into the `Agent` class as tools, memory, file access, web actions, or app-specific workflows.
