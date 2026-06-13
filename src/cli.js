import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Agent } from "./agent.js";
import { getConfig } from "./config.js";
import { OpenAIClient } from "./openaiClient.js";

const COMMANDS = new Map([
  ["/clear", "Reset the in-memory conversation."],
  ["/exit", "Quit the agent."],
  ["/help", "Show available commands."],
]);

async function main() {
  const config = getConfig();
  const client = new OpenAIClient({
    apiKey: config.apiKey,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
  });
  const agent = new Agent({
    client,
    name: config.agentName,
  });

  const rl = readline.createInterface({ input, output });

  console.log(`${agent.name} is ready. Type /help for commands.`);

  try {
    while (true) {
      const line = await rl.question("\nYou: ");
      const userText = line.trim();

      if (!userText) {
        continue;
      }

      if (await handleCommand(userText, agent)) {
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

async function handleCommand(command, agent) {
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
    agent.clear();
    console.log("\nConversation cleared.");
  }

  if (command === "/exit") {
    console.log("\nGoodbye.");
  }

  return true;
}

main().catch((error) => {
  console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
});
