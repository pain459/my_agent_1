import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Agent } from "./agent.js";
import { getConfig } from "./config.js";
import { OpenAIClient } from "./openaiClient.js";
import { SessionStore } from "./sessionStore.js";

const COMMANDS = new Map([
  ["/clear", "Reset the in-memory conversation."],
  ["/exit", "Quit the agent."],
  ["/help", "Show available commands."],
  ["/new", "Start a new session."],
  ["/session", "Show the current session."],
  ["/sessions", "List recent sessions."],
  ["/use", "Resume a saved session. Usage: /use <id>"],
]);

async function main() {
  const config = getConfig();
  const sessionStore = new SessionStore();
  const session = await sessionStore.createSession();
  const client = new OpenAIClient({
    apiKey: config.apiKey,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
  });
  const agent = new Agent({
    client,
    name: config.agentName,
    session,
    sessionStore,
  });

  const rl = readline.createInterface({ input, output });

  console.log(`${agent.name} is ready. Type /help for commands.`);
  console.log(`Session: ${agent.session.id} - ${agent.session.gist}`);

  try {
    while (true) {
      const line = await rl.question("\nYou: ");
      const userText = line.trim();

      if (!userText) {
        continue;
      }

      if (await handleCommand(userText, agent, sessionStore)) {
        if (userText === "/exit") {
          break;
        }

        continue;
      }

      try {
        const response = await agent.send(userText);
        console.log(`\n${agent.name}: ${response || "(No text response returned.)"}`);
      } catch (error) {
        console.error(`\nError: ${error.message}`);
      }
    }
  } finally {
    rl.close();
  }
}

async function handleCommand(inputCommand, agent, sessionStore) {
  const [command, ...args] = inputCommand.split(/\s+/);

  if (!COMMANDS.has(command)) {
    return false;
  }

  if (command === "/help") {
    console.log("\nCommands:");
    for (const [name, description] of COMMANDS) {
      console.log(`  ${name.padEnd(8)} ${description}`);
    }
  }

  if (command === "/clear") {
    await agent.clear();
    console.log(`\nConversation cleared. Session: ${agent.session.id}`);
  }

  if (command === "/exit") {
    console.log("\nGoodbye.");
  }

  if (command === "/new") {
    await agent.loadSession(await sessionStore.createSession());
    console.log(`\nStarted session ${agent.session.id}.`);
  }

  if (command === "/session") {
    printSession(agent.session);
  }

  if (command === "/sessions") {
    const sessions = await sessionStore.listSessions();
    printSessions(sessions);
  }

  if (command === "/use") {
    const id = args[0];

    if (!id) {
      console.log("\nUsage: /use <session-id>");
      return true;
    }

    const session = await sessionStore.getSession(id);

    if (!session) {
      console.log(`\nNo session found for ${id}.`);
      return true;
    }

    await agent.loadSession(session);
    console.log(`\nResumed session ${agent.session.id}: ${agent.session.gist}`);
  }

  return true;
}

function printSession(session) {
  console.log(`\nSession: ${session.id}`);
  console.log(`Gist: ${session.gist}`);
  console.log(`Messages: ${session.messages.length}`);
  console.log(`Created: ${session.createdAt}`);
  console.log(`Updated: ${session.updatedAt}`);
}

function printSessions(sessions) {
  if (sessions.length === 0) {
    console.log("\nNo saved sessions yet.");
    return;
  }

  console.log("\nRecent sessions:");

  for (const session of sessions.slice(0, 10)) {
    const messageCount = String(session.messages?.length || 0).padStart(2, " ");
    console.log(`  ${session.id}  ${messageCount} msgs  ${session.gist}`);
  }
}

main().catch((error) => {
  console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
});
