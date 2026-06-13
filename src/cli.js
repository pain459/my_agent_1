import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Agent } from "./agent.js";
import { getConfig } from "./config.js";
import { extractKnowledgeFromSession } from "./knowledgeExtractor.js";
import { formatKnownMemory, KnowledgeStore } from "./knowledgeStore.js";
import { OpenAIClient } from "./openaiClient.js";
import { getDefaultPersona, getPersona, listPersonas } from "./personas.js";
import { QaStore } from "./qaStore.js";
import { SessionStore } from "./sessionStore.js";

const COMMANDS = new Map([
  ["/clear", "Reset the in-memory conversation."],
  ["/exit", "Quit the agent."],
  ["/help", "Show available commands."],
  ["/knowledge-approve", "Approve a pending knowledge item. Usage: /knowledge-approve <id>"],
  ["/knowledge-build", "Extract pending knowledge from sessions. Optional: /knowledge-build <session-id>"],
  ["/knowledge-list", "List knowledge items. Optional: /knowledge-list pending|approved|rejected"],
  ["/knowledge-reject", "Reject a pending knowledge item. Usage: /knowledge-reject <id>"],
  ["/knowledge-search", "Search approved knowledge. Usage: /knowledge-search <query>"],
  ["/memory-build", "Rebuild the master Q/A database from all sessions."],
  ["/memory-search", "Search prior Q/A. Usage: /memory-search <question>"],
  ["/memory-stats", "Show master Q/A database stats and patterns."],
  ["/new", "Start a new session."],
  ["/session", "Show the current session."],
  ["/sessions", "List recent sessions."],
  ["/use", "Resume a saved session. Usage: /use <id>"],
]);

async function main() {
  const config = getConfig();
  const sessionStore = new SessionStore();
  const knowledgeStore = new KnowledgeStore();
  const qaStore = new QaStore();
  const rl = readline.createInterface({ input, output });
  const startupPersona = await selectPersona(rl);
  const session = await sessionStore.createSession({ persona: startupPersona });
  const client = new OpenAIClient({
    apiKey: config.apiKey,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
  });
  const extractionClient = new OpenAIClient({
    apiKey: config.apiKey,
    model: "gpt-4o-mini",
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

      if (await handleCommand(userText, {
        agent,
        extractionClient,
        knowledgeStore,
        qaStore,
        sessionStore,
        startupPersona,
      })) {
        if (userText === "/exit") {
          break;
        }

        continue;
      }

      try {
        const memoryAnswer = await findExactMemoryAnswer(qaStore, userText);

        if (memoryAnswer) {
          await agent.recordExchange(userText, memoryAnswer.answer, {
            source: "qa-memory",
            qaRecordId: memoryAnswer.id,
          });
          console.log(`\n${agent.name} [memory]: ${memoryAnswer.answer || "(No text response returned.)"}`);
          continue;
        }

        const knownMemory = formatKnownMemory(await knowledgeStore.search(userText, { limit: 5 }));
        const response = await agent.send(userText, { knownMemory });
        await qaStore.addExchange({
          session: agent.session,
          question: userText,
          answer: response,
        });
        console.log(`\n${agent.name}: ${response || "(No text response returned.)"}`);
      } catch (error) {
        console.error(`\nError: ${error.message}`);
      }
    }
  } finally {
    rl.close();
  }
}

async function handleCommand(inputCommand, context) {
  const {
    agent,
    extractionClient,
    knowledgeStore,
    qaStore,
    sessionStore,
    startupPersona,
  } = context;
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

  if (command === "/knowledge-build") {
    const sessionId = args[0];
    const sessions = sessionId
      ? [await sessionStore.getSession(sessionId)].filter(Boolean)
      : await sessionStore.listSessions();

    if (sessionId && sessions.length === 0) {
      console.log(`\nNo session found for ${sessionId}.`);
      return true;
    }

    let extractedCount = 0;
    let addedCount = 0;

    for (const session of sessions) {
      const candidates = await extractKnowledgeFromSession({
        client: extractionClient,
        session,
      });
      const added = await knowledgeStore.addCandidates(candidates);
      extractedCount += candidates.length;
      addedCount += added.length;
    }

    console.log(`\nExtracted ${extractedCount} candidates. Added ${addedCount} pending knowledge items.`);
  }

  if (command === "/knowledge-list") {
    const status = args[0];
    printKnowledgeItems(await knowledgeStore.list({ status }));
  }

  if (command === "/knowledge-approve") {
    await updateKnowledgeStatus({
      knowledgeStore,
      id: args[0],
      status: "approved",
    });
  }

  if (command === "/knowledge-reject") {
    await updateKnowledgeStatus({
      knowledgeStore,
      id: args[0],
      status: "rejected",
    });
  }

  if (command === "/knowledge-search") {
    const query = args.join(" ");

    if (!query) {
      console.log("\nUsage: /knowledge-search <query>");
      return true;
    }

    printKnowledgeItems(await knowledgeStore.search(query, { status: "approved" }));
  }

  if (command === "/memory-build") {
    const database = await qaStore.buildFromSessions(await sessionStore.listSessions());
    console.log(`\nBuilt master Q/A database with ${database.recordCount} records.`);
  }

  if (command === "/memory-search") {
    const question = args.join(" ");

    if (!question) {
      console.log("\nUsage: /memory-search <question>");
      return true;
    }

    printMemorySearchResults(await qaStore.search(question));
  }

  if (command === "/memory-stats") {
    printMemoryStats(await qaStore.stats());
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

async function updateKnowledgeStatus({ knowledgeStore, id, status }) {
  if (!id) {
    console.log(`\nUsage: /knowledge-${status === "approved" ? "approve" : "reject"} <id>`);
    return;
  }

  const item = await knowledgeStore.updateStatus(id, status);

  if (!item) {
    console.log(`\nNo knowledge item found for ${id}.`);
    return;
  }

  console.log(`\n${status === "approved" ? "Approved" : "Rejected"} ${item.id}: ${item.text}`);
}

async function findExactMemoryAnswer(qaStore, question) {
  const [match] = await qaStore.search(question, { limit: 1 });

  if (match?.score === 1) {
    return match;
  }

  return null;
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

function printMemorySearchResults(results) {
  if (results.length === 0) {
    console.log("\nNo prior answers found.");
    return;
  }

  console.log("\nPrior answers:");

  for (const result of results) {
    const score = Math.round(result.score * 100);
    console.log(`\n${score}%  ${result.personaName || "Unknown persona"}  ${result.sessionId}`);
    console.log(`Q: ${result.question}`);
    console.log(`A: ${truncateForDisplay(result.answer, 400)}`);
  }
}

function printMemoryStats(stats) {
  console.log("\nMaster Q/A database:");
  console.log(`Records: ${stats.recordCount}`);
  console.log(`Updated: ${stats.updatedAt}`);

  if (stats.repeatedQuestions.length > 0) {
    console.log("\nRepeated questions:");
    for (const item of stats.repeatedQuestions) {
      console.log(`  ${item.count}x  ${item.question}`);
    }
  }

  if (stats.topKeywords.length > 0) {
    console.log("\nCommon keywords:");
    console.log(`  ${stats.topKeywords.map((item) => `${item.keyword}(${item.count})`).join(", ")}`);
  }
}

function printKnowledgeItems(items) {
  if (items.length === 0) {
    console.log("\nNo knowledge items found.");
    return;
  }

  console.log("\nKnowledge items:");

  for (const item of items.slice(0, 20)) {
    const score = item.score ? ` ${Math.round(item.score * 100)}%` : "";
    console.log(`\n${item.id}${score}`);
    console.log(`${item.status} ${item.type} confidence=${item.confidence}`);
    console.log(truncateForDisplay(item.text, 500));
  }
}

function truncateForDisplay(text, maxLength) {
  const compact = String(text).replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3).trim()}...`;
}

main().catch((error) => {
  console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
});
