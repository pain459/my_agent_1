const DEFAULT_INSTRUCTIONS = [
  "You are a helpful, practical assistant.",
  "Ask concise clarifying questions when needed.",
  "When the user is building software, prefer concrete next steps.",
].join(" ");

export class Agent {
  constructor({ client, name, session, sessionStore, instructions = DEFAULT_INSTRUCTIONS }) {
    this.client = client;
    this.name = name;
    this.instructions = instructions;
    this.session = session;
    this.sessionStore = sessionStore;
  }

  async send(userText) {
    this.session.messages.push({
      role: "user",
      content: userText,
    });

    await this.save();

    const answer = await this.client.createResponse({
      instructions: this.instructions,
      input: this.session.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    this.session.messages.push({
      role: "assistant",
      content: answer,
    });

    await this.save();

    return answer;
  }

  async clear() {
    this.session.messages = [];
    await this.save();
  }

  async loadSession(session) {
    this.session = session;
    await this.save();
  }

  async save() {
    this.session = await this.sessionStore.saveSession(this.session);
    return this.session;
  }
}
