import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const SESSION_SCHEMA_VERSION = 1;

export class SessionStore {
  constructor({ directory = ".agent/sessions" } = {}) {
    this.directory = resolve(process.cwd(), directory);
  }

  async createSession({ persona } = {}) {
    await this.ensureDirectory();

    const now = new Date().toISOString();
    const session = {
      version: SESSION_SCHEMA_VERSION,
      id: createSessionId(now),
      gist: "New conversation",
      personaId: persona?.id,
      personaName: persona?.name,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };

    await this.saveSession(session);
    return session;
  }

  async getSession(id) {
    await this.ensureDirectory();

    const path = this.getSessionPath(id);

    if (!existsSync(path)) {
      return null;
    }

    return JSON.parse(await readFile(path, "utf8"));
  }

  async renameSession(id, title) {
    const session = await this.getSession(id);

    if (!session) {
      return null;
    }

    session.title = String(title || "").trim();
    return this.saveSession(session);
  }

  async deleteSession(id) {
    const session = await this.getSession(id);

    if (!session) {
      return null;
    }

    await rm(this.getSessionPath(id), { force: true });
    return session;
  }

  async listSessions() {
    await this.ensureDirectory();

    const names = await readdir(this.directory);
    const sessions = [];

    for (const name of names) {
      if (!name.endsWith(".json")) {
        continue;
      }

      try {
        const session = JSON.parse(await readFile(join(this.directory, name), "utf8"));
        sessions.push(session);
      } catch {
        // Ignore malformed session files so one bad file does not block the CLI.
      }
    }

    return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveSession(session) {
    await this.ensureDirectory();

    const now = new Date().toISOString();
    const nextSession = {
      ...session,
      version: session.version || SESSION_SCHEMA_VERSION,
      updatedAt: now,
      gist: buildSessionGist(session.messages),
    };

    await writeFile(
      this.getSessionPath(nextSession.id),
      `${JSON.stringify(nextSession, null, 2)}\n`,
      "utf8",
    );

    return nextSession;
  }

  async clearAllSessions() {
    await rm(this.directory, { force: true, recursive: true });
    await this.ensureDirectory();
  }

  async ensureDirectory() {
    await mkdir(this.directory, { recursive: true });
  }

  getSessionPath(id) {
    return join(this.directory, `${id}.json`);
  }
}

export function buildSessionGist(messages) {
  const userMessages = messages.filter((message) => message.role === "user");

  if (userMessages.length === 0) {
    return "New conversation";
  }

  const first = compactText(userMessages[0].content);
  const latest = compactText(userMessages[userMessages.length - 1].content);

  if (userMessages.length === 1 || first === latest) {
    return truncate(first, 90);
  }

  return truncate(`${first} / latest: ${latest}`, 120);
}

function createSessionId(isoDate) {
  const timestamp = isoDate.replace(/\D/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);

  return `${timestamp}-${random}`;
}

function compactText(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}
