import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Agent } from "./agent.js";
import { getConfig } from "./config.js";
import { OpenAIClient } from "./openaiClient.js";
import { getDefaultPersona, getPersona, listPersonas } from "./personas.js";
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
  const rl = readline.createInterface({ input, output });
  const startupPersona = await selectPersona(rl);
  const session = await sessionStore.createSession({ persona: startupPersona });
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

  console.log(`${agent.name} is ready. Type /help for commands.`);
  console.log(`Persona: ${startupPersona.name}`);
  console.log(`Session: ${agent.session.id} - ${agent.session.gist}`);

  try {
    while (true) {
      const line = await ask(rl, "\nYou: ");

      if (line === null) {
        break;
      }

      const userText = line.trim();

      if (!userText) {
        continue;
      }

      if (await handleCommand(userText, agent, sessionStore, startupPersona)) {
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

async function handleCommand(inputCommand, agent, sessionStore, startupPersona) {
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
    await agent.loadSession(await sessionStore.createSession({ persona: startupPersona }));
    console.log(`\nStarted session ${agent.session.id} with ${startupPersona.name}.`);
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
    console.log(`\nResumed session ${agent.session.id} with ${agent.session.personaName}: ${agent.session.gist}`);
  }

  return true;
}

async function selectPersona(rl) {
  const personas = listPersonas();

  console.log("\nChoose an agent persona for this run:");

  personas.forEach((persona, index) => {
    console.log(`  ${index + 1}. ${persona.name} - ${persona.tagline}`);
  });

  while (true) {
    const line = await ask(rl, "\nPersona number or id [1]: ");
    const answer = line === null ? "" : line.trim();

    if (!answer) {
      return getDefaultPersona();
    }

    const selectedByNumber = personas[Number(answer) - 1];
    const selectedById = getPersona(answer);

    if (selectedByNumber) {
      return selectedByNumber;
    }

    if (selectedById.id === answer) {
      return selectedById;
    }

    console.log("Please choose one of the listed numbers or persona ids.");
  }
}

async function ask(rl, prompt) {
  try {
    return await rl.question(prompt);
  } catch (error) {
    if (error.code === "ERR_USE_AFTER_CLOSE") {
      return null;
    }

    throw error;
  }
}

function printSession(session) {
  console.log(`\nSession: ${session.id}`);
  console.log(`Persona: ${session.personaName || getPersona(session.personaId).name}`);
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
    const personaName = session.personaName || getPersona(session.personaId).name;
    console.log(`  ${session.id}  ${messageCount} msgs  ${personaName}  ${session.gist}`);
  }
}

main().catch((error) => {
  console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
});
