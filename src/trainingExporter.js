import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { KnowledgeStore } from "./knowledgeStore.js";

export const DEFAULT_TRAINING_EXPORT_PATH = ".agent/exports/training.jsonl";

export async function exportTrainingData({
  knowledgeStore = new KnowledgeStore(),
  outputPath = DEFAULT_TRAINING_EXPORT_PATH,
} = {}) {
  const resolvedPath = resolve(process.cwd(), outputPath);
  const approvedItems = await knowledgeStore.list({ status: "approved" });
  const records = approvedItems.map(createTrainingRecord);

  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");

  return {
    outputPath: resolvedPath,
    recordCount: records.length,
  };
}

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
