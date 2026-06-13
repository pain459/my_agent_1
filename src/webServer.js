import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { Agent } from "./agent.js";
import { getConfig } from "./config.js";
import { extractKnowledgeFromSession } from "./knowledgeExtractor.js";
import { formatKnownMemory, KnowledgeStore } from "./knowledgeStore.js";
import { OpenAIClient } from "./openaiClient.js";
import { getPersona, listPersonas } from "./personas.js";
import { QaStore } from "./qaStore.js";
import { SessionStore } from "./sessionStore.js";
import { exportTrainingData } from "./trainingExporter.js";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = resolve(process.cwd(), "public");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const config = getConfig();
const sessionStore = new SessionStore();
const knowledgeStore = new KnowledgeStore();
const qaStore = new QaStore();
const client = new OpenAIClient({
  apiKey: config.apiKey,
  model: config.model,
  reasoningEffort: config.reasoningEffort,
});
const extractionClient = new OpenAIClient({
  apiKey: config.apiKey,
  model: "gpt-4o-mini",
});

createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, status, { error: error.message });
  }
}).listen(PORT, () => {
  console.log(`Agent UI is running at http://localhost:${PORT}`);
});

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const route = `${request.method} ${url.pathname}`;

  if (route === "GET /api/personas") {
    sendJson(response, 200, { personas: listPersonas() });
    return;
  }

  if (route === "GET /api/sessions") {
    sendJson(response, 200, { sessions: await sessionStore.listSessions() });
    return;
  }

  if (route === "POST /api/sessions") {
    const body = await readJsonBody(request);
    const session = await sessionStore.createSession({
      persona: getPersona(body.personaId),
    });
    sendJson(response, 200, { session });
    return;
  }

  if (route === "POST /api/chat") {
    const body = await readJsonBody(request);
    const session = await requireSession(body.sessionId);
    const message = String(body.message || "").trim();

    if (!message) {
      sendJson(response, 400, { error: "Message is required." });
      return;
    }

    const agent = new Agent({
      client,
      name: config.agentName,
      session,
      sessionStore,
    });
    const memoryAnswer = await findExactMemoryAnswer(message);

    if (memoryAnswer) {
      await agent.recordExchange(message, memoryAnswer.answer, {
        source: "qa-memory",
        qaRecordId: memoryAnswer.id,
      });
      sendJson(response, 200, {
        source: "qa-memory",
        answer: memoryAnswer.answer,
        session: agent.session,
      });
      return;
    }

    const knownMemory = formatKnownMemory(await knowledgeStore.search(message, { limit: 5 }));
    const answer = await agent.send(message, { knownMemory });
    await qaStore.addExchange({
      session: agent.session,
      question: message,
      answer,
    });
    sendJson(response, 200, { source: "openai", answer, session: agent.session });
    return;
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (request.method === "GET" && sessionMatch) {
    sendJson(response, 200, { session: await requireSession(sessionMatch[1]) });
    return;
  }

  const clearSessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/clear$/);
  if (request.method === "POST" && clearSessionMatch) {
    const agent = new Agent({
      client,
      name: config.agentName,
      session: await requireSession(clearSessionMatch[1]),
      sessionStore,
    });
    await agent.clear();
    sendJson(response, 200, { session: agent.session });
    return;
  }

  if (route === "POST /api/memory/build") {
    const database = await qaStore.buildFromSessions(await sessionStore.listSessions());
    sendJson(response, 200, { recordCount: database.recordCount });
    return;
  }

  if (route === "GET /api/memory/search") {
    sendJson(response, 200, { results: await qaStore.search(url.searchParams.get("q") || "") });
    return;
  }

  if (route === "GET /api/memory/stats") {
    sendJson(response, 200, { stats: await qaStore.stats() });
    return;
  }

  if (route === "GET /api/knowledge") {
    sendJson(response, 200, { items: await knowledgeStore.list({ status: url.searchParams.get("status") || undefined }) });
    return;
  }

  if (route === "POST /api/knowledge/build") {
    const body = await readJsonBody(request);
    const sessions = body.sessionId
      ? [await requireSession(body.sessionId)]
      : await sessionStore.listSessions();
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

    sendJson(response, 200, { extractedCount, addedCount });
    return;
  }

  if (route === "GET /api/knowledge/search") {
    sendJson(response, 200, { results: await knowledgeStore.search(url.searchParams.get("q") || "", { status: "approved" }) });
    return;
  }

  const knowledgeActionMatch = url.pathname.match(/^\/api\/knowledge\/([^/]+)\/(approve|reject|delete)$/);
  if (request.method === "POST" && knowledgeActionMatch) {
    const [, id, action] = knowledgeActionMatch;
    const item = action === "delete"
      ? await knowledgeStore.delete(id)
      : await knowledgeStore.updateStatus(id, action === "approve" ? "approved" : "rejected");

    if (!item) {
      sendJson(response, 404, { error: "Knowledge item not found." });
      return;
    }

    sendJson(response, 200, { item });
    return;
  }

  if (route === "POST /api/master-clear") {
    const body = await readJsonBody(request);
    const result = await masterClear(body);
    sendJson(response, 200, result);
    return;
  }

  if (route === "POST /api/training/export") {
    sendJson(response, 200, await exportTrainingData({ knowledgeStore }));
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

async function requireSession(id) {
  const session = await sessionStore.getSession(id);

  if (!session) {
    const error = new Error(`Session not found: ${id}`);
    error.statusCode = 404;
    throw error;
  }

  return session;
}

async function findExactMemoryAnswer(question) {
  const [match] = await qaStore.search(question, { limit: 1 });
  return match?.score === 1 ? match : null;
}

async function masterClear({ target, confirmation }) {
  const requiredConfirmations = {
    memory: "CONFIRM_CLEAR_MEMORY",
    chats: "CONFIRM_CLEAR_CHATS",
    all: "CONFIRM_CLEAR_ALL",
  };

  if (!requiredConfirmations[target]) {
    const error = new Error("Target must be memory, chats, or all.");
    error.statusCode = 400;
    throw error;
  }

  if (confirmation !== requiredConfirmations[target]) {
    const error = new Error(`Confirmation required: ${requiredConfirmations[target]}`);
    error.statusCode = 400;
    throw error;
  }

  if (target === "memory" || target === "all") {
    await knowledgeStore.clear();
    await qaStore.clear();
  }

  if (target === "chats" || target === "all") {
    await sessionStore.clearAllSessions();
  }

  return { cleared: target };
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const rawPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(join(PUBLIC_DIR, rawPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
