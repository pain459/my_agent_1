import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getKeywords, jaccardSimilarity, normalizeText } from "./textSearch.js";

const KNOWLEDGE_SCHEMA_VERSION = 1;
const VALID_TYPES = new Set(["fact", "preference", "decision", "procedure", "correction", "example"]);
const VALID_STATUSES = new Set(["pending", "approved", "rejected"]);

export class KnowledgeStore {
  constructor({ path = ".agent/knowledge.json" } = {}) {
    this.path = resolve(process.cwd(), path);
  }

  async load() {
    if (!existsSync(this.path)) {
      return createDatabase([]);
    }

    return JSON.parse(await readFile(this.path, "utf8"));
  }

  async addCandidates(candidates) {
    const database = await this.load();
    const existingFingerprints = new Set(database.items.map((item) => item.fingerprint));
    const now = new Date().toISOString();
    const added = [];

    for (const candidate of candidates) {
      const item = createKnowledgeItem(candidate, now);

      if (!item.text) {
        continue;
      }

      if (existingFingerprints.has(item.fingerprint)) {
        continue;
      }

      database.items.push(item);
      existingFingerprints.add(item.fingerprint);
      added.push(item);
    }

    database.updatedAt = now;
    database.itemCount = database.items.length;
    await this.save(database);

    return added;
  }

  async updateStatus(id, status) {
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`Invalid knowledge status: ${status}`);
    }

    const database = await this.load();
    const item = database.items.find((current) => current.id === id);

    if (!item) {
      return null;
    }

    item.status = status;
    item.updatedAt = new Date().toISOString();
    database.updatedAt = item.updatedAt;
    await this.save(database);

    return item;
  }

  async list({ status } = {}) {
    const database = await this.load();
    const items = status
      ? database.items.filter((item) => item.status === status)
      : database.items;

    return items.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  async search(query, { status = "approved", limit = 5 } = {}) {
    const database = await this.load();
    const queryKeywords = getKeywords(query);
    const normalizedQuery = normalizeText(query);

    return database.items
      .filter((item) => !status || item.status === status)
      .map((item) => ({
        ...item,
        score: scoreItem(item, normalizedQuery, queryKeywords),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async stats() {
    const database = await this.load();
    const byStatus = countBy(database.items, "status");
    const byType = countBy(database.items, "type");

    return {
      updatedAt: database.updatedAt,
      itemCount: database.items.length,
      byStatus,
      byType,
    };
  }

  async save(database) {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  }
}

export function formatKnownMemory(items) {
  if (items.length === 0) {
    return "";
  }

  return [
    "Known memory from approved prior conversations:",
    ...items.map((item) => `- [${item.type}] ${item.text}`),
  ].join("\n");
}

function createKnowledgeItem(candidate, now) {
  const text = String(candidate.text || "").trim();
  const type = VALID_TYPES.has(candidate.type) ? candidate.type : "fact";
  const sourceMessageIds = Array.isArray(candidate.sourceMessageIds)
    ? candidate.sourceMessageIds.map(String)
    : [];
  const sourceSessionId = String(candidate.sourceSessionId || "");
  const personaId = candidate.personaId ? String(candidate.personaId) : undefined;
  const confidence = clampConfidence(candidate.confidence);
  const fingerprint = createFingerprint({ type, text, sourceSessionId });

  return {
    id: createKnowledgeId(type, now),
    type,
    status: "pending",
    text,
    sourceSessionId,
    sourceMessageIds,
    personaId,
    confidence,
    fingerprint,
    keywords: getKeywords(text),
    createdAt: now,
    updatedAt: now,
  };
}

function createDatabase(items) {
  const now = new Date().toISOString();

  return {
    version: KNOWLEDGE_SCHEMA_VERSION,
    updatedAt: now,
    itemCount: items.length,
    items,
  };
}

function createKnowledgeId(type, now) {
  const timestamp = now.replace(/\D/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);

  return `kn-${type}-${timestamp}-${random}`;
}

function createFingerprint({ type, text, sourceSessionId }) {
  return normalizeText(`${sourceSessionId} ${type} ${text}`);
}

function scoreItem(item, normalizedQuery, queryKeywords) {
  if (normalizeText(item.text).includes(normalizedQuery)) {
    return 1;
  }

  return jaccardSimilarity(item.keywords || [], queryKeywords);
}

function clampConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, number));
}

function countBy(items, key) {
  const counts = {};

  for (const item of items) {
    counts[item[key]] = (counts[item[key]] || 0) + 1;
  }

  return counts;
}
