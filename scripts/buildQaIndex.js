import { QaStore } from "../src/qaStore.js";
import { SessionStore } from "../src/sessionStore.js";

const sessionStore = new SessionStore();
const qaStore = new QaStore();
const sessions = await sessionStore.listSessions();
const database = await qaStore.buildFromSessions(sessions);

console.log(`Built master Q/A database with ${database.recordCount} records.`);
