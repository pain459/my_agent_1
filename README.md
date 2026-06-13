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

```bash
npm start
```

Choose the agent persona when the program starts, then type your message and press Enter. Use `/exit` to quit, `/clear` to reset conversation memory, and `/help` to see commands.

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
/session      Show the active session id, gist, and timestamps.
/sessions     List recent saved sessions with short gists.
/use <id>     Resume a saved session.
/new          Start a fresh session with the startup persona.
/clear        Clear messages in the active session.
```

## Project Structure

- `src/cli.js` runs the interactive terminal loop.
- `src/agent.js` owns conversation state and agent behavior.
- `src/openaiClient.js` wraps OpenAI API calls.
- `src/personas.js` defines available agent personalities.
- `src/config.js` loads environment configuration.

## Notes

This first version intentionally has a narrow surface area. Future features can plug into the `Agent` class as tools, memory, file access, web actions, or app-specific workflows.
