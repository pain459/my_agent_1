const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export class OpenAIClient {
  constructor({ apiKey, model, fetchImpl = fetch }) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required.");
    }

    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async createResponse({ instructions, input }) {
    const response = await this.fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: "low" },
        instructions,
        input,
      }),
    });

    const payload = await readJson(response);

    if (!response.ok) {
      const message = payload?.error?.message || response.statusText;
      throw new Error(`OpenAI API request failed: ${message}`);
    }

    return payload.output_text || extractOutputText(payload);
  }
}

async function readJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractOutputText(payload) {
  const parts = [];

  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}
