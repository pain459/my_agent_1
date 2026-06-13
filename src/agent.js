const DEFAULT_INSTRUCTIONS = [
  "You are a helpful, practical assistant.",
  "Ask concise clarifying questions when needed.",
  "When the user is building software, prefer concrete next steps.",
].join(" ");

export class Agent {
  constructor({ client, name, instructions = DEFAULT_INSTRUCTIONS }) {
    this.client = client;
    this.name = name;
    this.instructions = instructions;
    this.messages = [];
  }

  async send(userText) {
    this.messages.push({
      role: "user",
      content: userText,
    });

    const answer = await this.client.createResponse({
      instructions: this.instructions,
      input: this.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    this.messages.push({
      role: "assistant",
      content: answer,
    });

    return answer;
  }

  clear() {
    this.messages = [];
  }
}
