export const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "so",
  "the",
  "this",
  "to",
  "we",
  "what",
  "with",
  "you",
]);

export function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function getKeywords(text) {
  return normalizeText(text)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function jaccardSimilarity(leftWords, rightWords) {
  const left = new Set(leftWords);
  const right = new Set(rightWords);

  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;

  return intersection / union;
}
