import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const QA_SCHEMA_VERSION = 1;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "so",
  "the",
  "this",
  "to",
  "we",
  "what",
  "with",
  "you",
]);

export class QaStore {
  constructor({ path = ".agent/qa-index.json" } = {}) {
    this.path = resolve(process.cwd(), path);
  }

  async buildFromSessions(sessions) {
    const records = [];

    for (const session of sessions) {
      records.push(...extractQaRecords(session));
    }

    const database = createDatabase(records);
    await this.save(database);
    return database;
  }

  async load() {
    if (!existsSync(this.path)) {
      return createDatabase([]);
    }

    return JSON.parse(await readFile(this.path, "utf8"));
  }

  async addExchange({ session, question, answer }) {
    const database = await this.load();
    const record = createQaRecord({
      session,
      pairIndex: Math.max(0, session.messages.length - 2),
      question,
      answer,
      createdAt: new Date().toISOString(),
    });

    database.records = upsertRecord(database.records, record);
    database.updatedAt = new Date().toISOString();
    database.recordCount = database.records.length;
    await this.save(database);

    return record;
  }

  async search(question, { limit = 5 } = {}) {
    const database = await this.load();
    return searchRecords(database.records, question).slice(0, limit);
  }

  async stats() {
    const database = await this.load();
    const repeatedQuestions = findRepeatedQuestions(database.records);
    const topKeywords = findTopKeywords(database.records);

    return {
      updatedAt: database.updatedAt,
      recordCount: database.records.length,
      repeatedQuestions,
      topKeywords,
    };
  }

  async save(database) {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  }
}

export function normalizeQuestion(question) {
  return String(question)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractQaRecords(session) {
  const records = [];

  for (let index = 0; index < session.messages.length - 1; index += 1) {
    const current = session.messages[index];
    const next = session.messages[index + 1];

    if (current.role === "user" && next.role === "assistant") {
      records.push(createQaRecord({
        session,
        pairIndex: index,
        question: current.content,
        answer: next.content,
        createdAt: next.createdAt || session.updatedAt || session.createdAt,
      }));
    }
  }

  return records;
}

function createQaRecord({ session, pairIndex, question, answer, createdAt }) {
  const normalizedQuestion = normalizeQuestion(question);
  const keywords = getKeywords(normalizedQuestion);

  return {
    id: `${session.id}:${pairIndex}`,
    sessionId: session.id,
    sessionGist: session.gist,
    personaId: session.personaId,
    personaName: session.personaName,
    question,
    answer,
    normalizedQuestion,
    keywords,
    createdAt,
  };
}

function createDatabase(records) {
  const now = new Date().toISOString();

  return {
    version: QA_SCHEMA_VERSION,
    updatedAt: now,
    recordCount: records.length,
    records,
  };
}

function upsertRecord(records, record) {
  const filtered = records.filter((existing) => existing.id !== record.id);
  filtered.push(record);
  return filtered.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

function searchRecords(records, question) {
  const normalizedQuestion = normalizeQuestion(question);
  const keywords = getKeywords(normalizedQuestion);

  return records
    .map((record) => ({
      ...record,
      score: scoreRecord(record, normalizedQuestion, keywords),
    }))
    .filter((record) => record.score > 0)
    .sort((left, right) => right.score - left.score);
}

function scoreRecord(record, normalizedQuestion, keywords) {
  if (record.normalizedQuestion === normalizedQuestion) {
    return 1;
  }

  return jaccardSimilarity(new Set(record.keywords || []), new Set(keywords));
}

function getKeywords(text) {
  return String(text)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function jaccardSimilarity(left, right) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;

  return intersection / union;
}

function findRepeatedQuestions(records) {
  const groups = new Map();

  for (const record of records) {
    const group = groups.get(record.normalizedQuestion) || [];
    group.push(record);
    groups.set(record.normalizedQuestion, group);
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .sort((left, right) => right.length - left.length)
    .slice(0, 10)
    .map((group) => ({
      count: group.length,
      question: group[0].question,
    }));
}

function findTopKeywords(records) {
  const counts = new Map();

  for (const record of records) {
    for (const keyword of record.keywords || []) {
      counts.set(keyword, (counts.get(keyword) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 15)
    .map(([keyword, count]) => ({ keyword, count }));
}
