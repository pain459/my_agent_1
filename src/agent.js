import { getPersona, getPersonaInstructions } from "./personas.js";

export class Agent {
  constructor({ client, name, session, sessionStore }) {
    this.client = client;
    this.name = name;
    this.session = session;
    this.sessionStore = sessionStore;
  }

  async send(userText) {
    this.session.messages.push({
      role: "user",
      content: userText,
      createdAt: new Date().toISOString(),
    });

    await this.save();

    const answer = await this.client.createResponse({
      instructions: getPersonaInstructions(this.session.personaId),
      input: this.session.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    this.session.messages.push({
      role: "assistant",
      content: answer,
      createdAt: new Date().toISOString(),
    });

    await this.save();

    return answer;
  }

  async recordExchange(userText, assistantText, metadata = {}) {
    this.session.messages.push({
      role: "user",
      content: userText,
      createdAt: new Date().toISOString(),
      metadata,
    });
    this.session.messages.push({
      role: "assistant",
      content: assistantText,
      createdAt: new Date().toISOString(),
      metadata,
    });

    await this.save();
  }

  async clear() {
    this.session.messages = [];
    await this.save();
  }

  async loadSession(session) {
    const persona = getPersona(session.personaId);

    this.session = {
      ...session,
      personaId: persona.id,
      personaName: persona.name,
    };
    await this.save();
  }

  async save() {
    this.session = await this.sessionStore.saveSession(this.session);
    return this.session;
  }
}
