import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_LOG_PATH = ".agent/logs/app.log";

export class Logger {
  constructor({ path = DEFAULT_LOG_PATH } = {}) {
    this.path = resolve(process.cwd(), path);
  }

  async info(event, details = {}) {
    await this.write("info", event, details);
  }

  async error(event, error, details = {}) {
    await this.write("error", event, {
      ...details,
      message: error.message,
      stack: error.stack,
    });
  }

  async read({ limit = 200 } = {}) {
    try {
      const text = await readFile(this.path, "utf8");
      return text
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(-limit)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return { level: "unknown", event: "parse_failed", raw: line };
          }
        })
        .reverse();
    } catch {
      return [];
    }
  }

  async write(level, event, details) {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event,
      details,
    };

    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      flag: "a",
    });
  }
}
