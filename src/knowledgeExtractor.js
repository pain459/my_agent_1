const EXTRACTION_INSTRUCTIONS = [
  "Extract reusable knowledge from the provided chat session.",
  "Return only strict JSON with this shape: {\"items\":[{\"type\":\"fact|preference|decision|procedure|correction|example\",\"text\":\"concise reusable knowledge\",\"sourceMessageIds\":[\"0\",\"1\"],\"confidence\":0.0}]}",
  "Include only knowledge that is likely useful in future conversations.",
  "Do not include one-off chit-chat, greetings, API keys, credentials, secrets, or obviously private personal data.",
  "Use type preference for stable user preferences, decision for project choices, procedure for repeatable steps, correction for user corrections, example for reusable training examples, and fact for stable project facts.",
  "Keep each text value short, standalone, and clear.",
].join(" ");

export async function extractKnowledgeFromSession({ client, session }) {
  if (!session.messages || session.messages.length === 0) {
    return [];
  }

  const responseText = await client.createResponse({
    instructions: EXTRACTION_INSTRUCTIONS,
    input: buildExtractionInput(session),
  });
  const parsed = parseJsonObject(responseText);

  return (parsed.items || []).map((item) => ({
    ...item,
    sourceSessionId: session.id,
    personaId: session.personaId,
  }));
}

function buildExtractionInput(session) {
  return JSON.stringify({
    session: {
      id: session.id,
      gist: session.gist,
      personaId: session.personaId,
      personaName: session.personaName,
    },
    messages: session.messages.map((message, index) => ({
      id: String(index),
      role: message.role,
      content: message.content,
    })),
  });
}

function parseJsonObject(text) {
  const trimmed = String(text).trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);

    if (!match) {
      return { items: [] };
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return { items: [] };
    }
  }
}
