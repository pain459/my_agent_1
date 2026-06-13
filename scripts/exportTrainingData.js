import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { KnowledgeStore } from "../src/knowledgeStore.js";

const DEFAULT_OUTPUT_PATH = ".agent/exports/training.jsonl";
const outputPath = resolve(process.cwd(), process.argv[2] || DEFAULT_OUTPUT_PATH);
const knowledgeStore = new KnowledgeStore();
const approvedItems = await knowledgeStore.list({ status: "approved" });
const records = approvedItems.map(createTrainingRecord);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");

console.log(`Exported ${records.length} approved training records to ${outputPath}.`);

function createTrainingRecord(item) {
  return {
    messages: [
      {
        role: "system",
        content: "Use approved project memory to answer consistently.",
      },
      {
        role: "user",
        content: `Remember this ${item.type} for future conversations.`,
      },
      {
        role: "assistant",
        content: item.text,
      },
    ],
    metadata: {
      knowledgeId: item.id,
      type: item.type,
      sourceSessionId: item.sourceSessionId,
      personaId: item.personaId,
    },
  };
}
