#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import random
import re
import shutil
import string
import sys
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path.cwd()
PUBLIC_DIR = ROOT / "public"
AGENT_DIR = ROOT / ".agent"
SESSIONS_DIR = AGENT_DIR / "sessions"
QA_INDEX_PATH = AGENT_DIR / "qa-index.json"
KNOWLEDGE_PATH = AGENT_DIR / "knowledge.json"
INGESTION_PATH = AGENT_DIR / "knowledge-ingestion.json"
LOG_PATH = AGENT_DIR / "logs" / "app.log"
TRAINING_EXPORT_PATH = AGENT_DIR / "exports" / "training.jsonl"

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_AGENT_NAME = "My Agent"
DEFAULT_PORT = 3000

VALID_KNOWLEDGE_TYPES = {"fact", "preference", "decision", "procedure", "correction", "example"}
VALID_KNOWLEDGE_STATUSES = {"pending", "approved", "rejected"}
STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
    "how", "i", "in", "is", "it", "of", "on", "or", "our", "so", "the",
    "this", "to", "we", "what", "with", "you",
}

PERSONAS = [
    {
        "id": "general",
        "name": "General Assistant",
        "tagline": "Balanced help for everyday questions and planning.",
        "instructions": [
            "You are a calm, capable general-purpose assistant.",
            "Be clear, practical, and friendly without overexplaining simple topics.",
            "When a request is vague, ask one focused clarifying question, then continue once you have enough context.",
            "Use concise structure for complex answers and plain prose for simple ones.",
            "Prefer useful next steps, realistic tradeoffs, and answers the user can act on immediately.",
        ],
    },
    {
        "id": "engineer",
        "name": "Senior Software Engineer",
        "tagline": "Architecture, debugging, implementation, reviews, and tradeoffs.",
        "instructions": [
            "You are a senior software engineer who is careful, pragmatic, and direct.",
            "First understand the existing system, constraints, and failure modes before proposing changes.",
            "Prefer small, maintainable designs over clever abstractions, and explain tradeoffs when they matter.",
            "When debugging, reason from symptoms to evidence, identify likely causes, and suggest verification steps.",
            "When reviewing code, prioritize correctness, security, maintainability, and missing tests over style preferences.",
            "Use precise technical language, but keep explanations approachable for mixed-experience teams.",
        ],
    },
    {
        "id": "researcher",
        "name": "Research Analyst",
        "tagline": "Careful synthesis, uncertainty tracking, and source-minded reasoning.",
        "instructions": [
            "You are a research analyst who values accuracy, nuance, and intellectual honesty.",
            "Separate confirmed facts, reasonable inferences, and open questions.",
            "When information may be incomplete or time-sensitive, say what would need verification.",
            "Summarize complex material into clear themes, caveats, and decision-relevant takeaways.",
            "Avoid overstating confidence; include uncertainty when the evidence does not fully support a claim.",
            "Prefer comparative framing, assumptions, and concise executive summaries for broad topics.",
        ],
    },
    {
        "id": "writer",
        "name": "Writing Coach",
        "tagline": "Drafting, editing, voice, clarity, and persuasion.",
        "instructions": [
            "You are a thoughtful writing coach with a strong ear for voice and structure.",
            "Preserve the user's intent and personality while improving clarity, rhythm, and impact.",
            "Offer edits that make writing sharper without making it generic.",
            "When useful, explain the reason behind important edits in simple language.",
            "For creative work, help develop tone, scene, character, pacing, and emotional texture.",
            "For professional writing, focus on audience, message hierarchy, brevity, and credibility.",
        ],
    },
    {
        "id": "product",
        "name": "Product Strategist",
        "tagline": "Feature definition, prioritization, UX thinking, and product decisions.",
        "instructions": [
            "You are a product strategist who turns loose ideas into focused product direction.",
            "Clarify the target user, job to be done, success metric, and constraints before expanding scope.",
            "Prefer practical MVPs, crisp prioritization, and user workflows over feature lists.",
            "Call out risks, dependencies, hidden assumptions, and what should be learned next.",
            "Frame recommendations in terms of user value, feasibility, business impact, and sequencing.",
            "Keep product language concrete and avoid vague strategy theater.",
        ],
    },
    {
        "id": "teacher",
        "name": "Patient Tutor",
        "tagline": "Step-by-step learning with examples and checks for understanding.",
        "instructions": [
            "You are a patient tutor who helps the user build real understanding.",
            "Start from the user's current level and introduce concepts gradually.",
            "Use examples, analogies, and small exercises when they help the idea land.",
            "Check understanding without being patronizing.",
            "If the user is stuck, diagnose the exact missing concept and explain it another way.",
            "Encourage progress, but keep the focus on clear reasoning and practice.",
        ],
    },
    {
        "id": "ops",
        "name": "Operations Planner",
        "tagline": "Plans, processes, checklists, logistics, and execution detail.",
        "instructions": [
            "You are an operations planner who makes work concrete, sequenced, and trackable.",
            "Turn broad goals into phases, owners, dependencies, risks, and next actions.",
            "Prefer simple operating systems that people can actually follow.",
            "Surface bottlenecks, ambiguous responsibilities, and missing decision points.",
            "Use checklists, runbooks, schedules, and status summaries when they improve execution.",
            "Keep recommendations practical and resilient to ordinary real-world friction.",
        ],
    },
    {
        "id": "coach",
        "name": "Reflective Coach",
        "tagline": "Thoughtful conversation for decisions, habits, and personal clarity.",
        "instructions": [
            "You are a reflective coach who is warm, grounded, and honest.",
            "Help the user think clearly without taking over their agency.",
            "Ask gentle but useful questions that reveal values, constraints, emotions, and options.",
            "Avoid clinical claims or pretending to be a therapist.",
            "When the user needs action, help translate reflection into small, concrete next steps.",
            "Balance empathy with clarity; do not flatter or dramatize.",
        ],
    },
]
PERSONA_BY_ID = {persona["id"]: persona for persona in PERSONAS}

EXTRACTION_INSTRUCTIONS = " ".join([
    "Extract reusable knowledge from the provided chat session.",
    "Return only strict JSON with this shape: {\"items\":[{\"type\":\"fact|preference|decision|procedure|correction|example\",\"text\":\"concise reusable knowledge\",\"sourceMessageIds\":[\"0\",\"1\"],\"confidence\":0.0}]}",
    "Include only knowledge that is likely useful in future conversations.",
    "Do not include one-off chit-chat, greetings, API keys, credentials, secrets, or obviously private personal data.",
    "Use type preference for stable user preferences, decision for project choices, procedure for repeatable steps, correction for user corrections, example for reusable training examples, and fact for stable project facts.",
    "Keep each text value short, standalone, and clear.",
])


class HttpError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        os.environ.setdefault(key, value)


def config() -> dict:
    load_dotenv()
    return {
        "api_key": os.environ.get("OPENAI_API_KEY"),
        "model": os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
        "agent_name": os.environ.get("AGENT_NAME", DEFAULT_AGENT_NAME),
        "reasoning_effort": os.environ.get("OPENAI_REASONING_EFFORT"),
    }


CONFIG = config()


def read_json(path: Path, fallback):
    if not path.exists():
        return fallback() if callable(fallback) else fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def append_log(level: str, event: str, details: dict | None = None) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": now_iso(),
        "level": level,
        "event": event,
        "details": details or {},
    }
    with LOG_PATH.open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(record) + "\n")


def read_logs(limit: int = 200) -> list[dict]:
    if not LOG_PATH.exists():
        return []
    lines = [line for line in LOG_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    records = []
    for line in lines[-limit:]:
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            records.append({"level": "unknown", "event": "parse_failed", "raw": line})
    return list(reversed(records))


def persona_for(persona_id: str | None) -> dict:
    return PERSONA_BY_ID.get(persona_id or "general", PERSONA_BY_ID["general"])


def persona_instructions(persona_id: str | None) -> str:
    return " ".join(persona_for(persona_id)["instructions"])


def normalize_text(text: str) -> str:
    text = text.lower().replace("'", "").replace('"', "")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def keywords(text: str) -> list[str]:
    return [word for word in normalize_text(text).split() if len(word) > 2 and word not in STOP_WORDS]


def jaccard(left_words: list[str], right_words: list[str]) -> float:
    left = set(left_words)
    right = set(right_words)
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def random_suffix(length: int = 6) -> str:
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(length))


def create_session_id(timestamp: str) -> str:
    compact = re.sub(r"\D", "", timestamp)[:14]
    return f"{compact}-{random_suffix()}"


def build_session_gist(messages: list[dict]) -> str:
    user_messages = [message for message in messages if message.get("role") == "user"]
    if not user_messages:
        return "New conversation"
    first = " ".join(str(user_messages[0].get("content", "")).split())
    latest = " ".join(str(user_messages[-1].get("content", "")).split())
    text = first if len(user_messages) == 1 or first == latest else f"{first} / latest: {latest}"
    return text[:117].rstrip() + "..." if len(text) > 120 else text


def session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"


def save_session(session: dict) -> dict:
    timestamp = now_iso()
    next_session = {
        **session,
        "version": session.get("version", 1),
        "updatedAt": timestamp,
        "gist": build_session_gist(session.get("messages", [])),
    }
    write_json(session_path(next_session["id"]), next_session)
    return next_session


def create_session(persona_id: str | None) -> dict:
    persona = persona_for(persona_id)
    timestamp = now_iso()
    session = {
        "version": 1,
        "id": create_session_id(timestamp),
        "gist": "New conversation",
        "personaId": persona["id"],
        "personaName": persona["name"],
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "messages": [],
    }
    return save_session(session)


def get_session(session_id: str) -> dict | None:
    path = session_path(session_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def require_session(session_id: str) -> dict:
    session = get_session(session_id)
    if not session:
        raise HttpError(404, f"Session not found: {session_id}")
    return session


def list_sessions() -> list[dict]:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    sessions = []
    for path in SESSIONS_DIR.glob("*.json"):
        try:
            sessions.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return sorted(sessions, key=lambda item: item.get("updatedAt", ""), reverse=True)


def rename_session(session_id: str, title: str) -> dict | None:
    session = get_session(session_id)
    if not session:
        return None
    session["title"] = str(title or "").strip()
    return save_session(session)


def delete_session(session_id: str) -> dict | None:
    session = get_session(session_id)
    if not session:
        return None
    session_path(session_id).unlink(missing_ok=True)
    return session


def clear_sessions() -> None:
    shutil.rmtree(SESSIONS_DIR, ignore_errors=True)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


def openai_response(instructions: str, input_value, model: str | None = None, reasoning_effort: str | None = None) -> str:
    api_key = CONFIG["api_key"]
    if not api_key:
        raise HttpError(500, "OPENAI_API_KEY is required.")
    body = {
        "model": model or CONFIG["model"],
        "instructions": instructions,
        "input": input_value,
    }
    if reasoning_effort:
        body["reasoning"] = {"effort": reasoning_effort}
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8"))
            message = payload.get("error", {}).get("message", error.reason)
        except Exception:
            message = error.reason
        raise HttpError(error.code, f"OpenAI API request failed: {message}") from error
    return payload.get("output_text") or extract_output_text(payload)


def extract_output_text(payload: dict) -> str:
    parts = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                parts.append(content["text"])
    return "\n".join(parts).strip()


def known_memory_text(items: list[dict]) -> str:
    if not items:
        return ""
    lines = ["Known memory from approved prior conversations:"]
    lines.extend([f"- [{item.get('type')}] {item.get('text')}" for item in items])
    return "\n".join(lines)


def send_agent_message(session: dict, user_text: str, known_memory: str = "") -> tuple[str, dict]:
    session.setdefault("messages", []).append({
        "role": "user",
        "content": user_text,
        "createdAt": now_iso(),
    })
    session = save_session(session)
    instructions = persona_instructions(session.get("personaId"))
    if known_memory:
        instructions = f"{instructions}\n\n{known_memory}"
    answer = openai_response(
        instructions=instructions,
        input_value=[{"role": message["role"], "content": message.get("content", "")} for message in session["messages"]],
        reasoning_effort=CONFIG["reasoning_effort"],
    )
    session["messages"].append({
        "role": "assistant",
        "content": answer,
        "createdAt": now_iso(),
    })
    return answer, save_session(session)


def record_exchange(session: dict, user_text: str, assistant_text: str, metadata: dict) -> dict:
    session.setdefault("messages", []).extend([
        {
            "role": "user",
            "content": user_text,
            "createdAt": now_iso(),
            "metadata": metadata,
        },
        {
            "role": "assistant",
            "content": assistant_text,
            "createdAt": now_iso(),
            "metadata": metadata,
        },
    ])
    return save_session(session)


def qa_database(records: list[dict] | None = None) -> dict:
    records = records or []
    return {"version": 1, "updatedAt": now_iso(), "recordCount": len(records), "records": records}


def load_qa() -> dict:
    return read_json(QA_INDEX_PATH, qa_database)


def save_qa(database: dict) -> dict:
    database["updatedAt"] = now_iso()
    database["recordCount"] = len(database.get("records", []))
    write_json(QA_INDEX_PATH, database)
    return database


def create_qa_record(session: dict, pair_index: int, question: str, answer: str, created_at: str | None = None) -> dict:
    normalized = normalize_text(question)
    return {
        "id": f"{session['id']}:{pair_index}",
        "sessionId": session["id"],
        "sessionGist": session.get("gist"),
        "personaId": session.get("personaId"),
        "personaName": session.get("personaName"),
        "question": question,
        "answer": answer,
        "normalizedQuestion": normalized,
        "keywords": keywords(normalized),
        "createdAt": created_at or now_iso(),
    }


def extract_qa_records(session: dict) -> list[dict]:
    messages = session.get("messages", [])
    records = []
    for index in range(len(messages) - 1):
        current = messages[index]
        following = messages[index + 1]
        if current.get("role") == "user" and following.get("role") == "assistant":
            records.append(create_qa_record(
                session,
                index,
                current.get("content", ""),
                following.get("content", ""),
                following.get("createdAt") or session.get("updatedAt") or session.get("createdAt"),
            ))
    return records


def build_qa_from_sessions() -> dict:
    records = []
    for session in list_sessions():
        records.extend(extract_qa_records(session))
    database = qa_database(records)
    write_json(QA_INDEX_PATH, database)
    return database


def add_qa_exchange(session: dict, question: str, answer: str) -> dict:
    database = load_qa()
    record = create_qa_record(session, max(0, len(session.get("messages", [])) - 2), question, answer)
    records = [item for item in database.get("records", []) if item.get("id") != record["id"]]
    records.append(record)
    database["records"] = sorted(records, key=lambda item: item.get("createdAt", ""), reverse=True)
    return save_qa(database)


def search_qa(question: str, limit: int = 5) -> list[dict]:
    database = load_qa()
    normalized = normalize_text(question)
    query_keywords = keywords(normalized)
    results = []
    for record in database.get("records", []):
        if record.get("normalizedQuestion") == normalized:
            score = 1.0
        else:
            score = jaccard(record.get("keywords", []), query_keywords)
        if score > 0:
            results.append({**record, "score": score})
    return sorted(results, key=lambda item: item["score"], reverse=True)[:limit]


def qa_stats() -> dict:
    database = load_qa()
    counts = {}
    keyword_counts = {}
    for record in database.get("records", []):
        normalized = record.get("normalizedQuestion", "")
        counts.setdefault(normalized, {"count": 0, "question": record.get("question", "")})
        counts[normalized]["count"] += 1
        for keyword in record.get("keywords", []):
            keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1
    repeated = sorted([item for item in counts.values() if item["count"] > 1], key=lambda item: item["count"], reverse=True)[:10]
    top_keywords = [{"keyword": key, "count": value} for key, value in sorted(keyword_counts.items(), key=lambda item: item[1], reverse=True)[:15]]
    return {
        "updatedAt": database.get("updatedAt"),
        "recordCount": len(database.get("records", [])),
        "repeatedQuestions": repeated,
        "topKeywords": top_keywords,
    }


def clear_qa() -> dict:
    database = qa_database([])
    write_json(QA_INDEX_PATH, database)
    return database


def knowledge_database(items: list[dict] | None = None) -> dict:
    items = items or []
    return {"version": 1, "updatedAt": now_iso(), "itemCount": len(items), "items": items}


def load_knowledge() -> dict:
    return read_json(KNOWLEDGE_PATH, knowledge_database)


def save_knowledge(database: dict) -> dict:
    database["updatedAt"] = now_iso()
    database["itemCount"] = len(database.get("items", []))
    write_json(KNOWLEDGE_PATH, database)
    return database


def create_knowledge_item(candidate: dict) -> dict:
    timestamp = now_iso()
    text = str(candidate.get("text", "")).strip()
    item_type = candidate.get("type") if candidate.get("type") in VALID_KNOWLEDGE_TYPES else "fact"
    source_session_id = str(candidate.get("sourceSessionId", ""))
    fingerprint = normalize_text(f"{source_session_id} {item_type} {text}")
    try:
        confidence = float(candidate.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))
    return {
        "id": f"kn-{item_type}-{re.sub(r'\\D', '', timestamp)[:14]}-{random_suffix()}",
        "type": item_type,
        "status": "pending",
        "text": text,
        "sourceSessionId": source_session_id,
        "sourceMessageIds": [str(value) for value in candidate.get("sourceMessageIds", []) if value is not None],
        "personaId": candidate.get("personaId"),
        "confidence": confidence,
        "fingerprint": fingerprint,
        "keywords": keywords(text),
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


def add_knowledge_candidates(candidates: list[dict]) -> list[dict]:
    database = load_knowledge()
    existing = {item.get("fingerprint") for item in database.get("items", [])}
    added = []
    for candidate in candidates:
        item = create_knowledge_item(candidate)
        if not item["text"] or item["fingerprint"] in existing:
            continue
        database.setdefault("items", []).append(item)
        existing.add(item["fingerprint"])
        added.append(item)
    save_knowledge(database)
    return added


def list_knowledge(status: str | None = None) -> list[dict]:
    items = load_knowledge().get("items", [])
    if status:
        items = [item for item in items if item.get("status") == status]
    return sorted(items, key=lambda item: item.get("updatedAt", ""), reverse=True)


def update_knowledge_status(item_id: str, status: str) -> dict | None:
    if status not in VALID_KNOWLEDGE_STATUSES:
        raise HttpError(400, f"Invalid knowledge status: {status}")
    database = load_knowledge()
    for item in database.get("items", []):
        if item.get("id") == item_id:
            item["status"] = status
            item["updatedAt"] = now_iso()
            save_knowledge(database)
            return item
    return None


def delete_knowledge(item_id: str) -> dict | None:
    database = load_knowledge()
    items = database.get("items", [])
    found = next((item for item in items if item.get("id") == item_id), None)
    if not found:
        return None
    database["items"] = [item for item in items if item.get("id") != item_id]
    save_knowledge(database)
    return found


def search_knowledge(query: str, status: str | None = "approved", limit: int = 5) -> list[dict]:
    query_keywords = keywords(query)
    normalized = normalize_text(query)
    results = []
    for item in load_knowledge().get("items", []):
        if status and item.get("status") != status:
            continue
        score = 1.0 if normalized and normalized in normalize_text(item.get("text", "")) else jaccard(item.get("keywords", []), query_keywords)
        if score > 0:
            results.append({**item, "score": score})
    return sorted(results, key=lambda item: item["score"], reverse=True)[:limit]


def clear_knowledge() -> dict:
    database = knowledge_database([])
    write_json(KNOWLEDGE_PATH, database)
    return database


def load_ingestion() -> dict:
    return read_json(INGESTION_PATH, lambda: {"version": 1, "updatedAt": now_iso(), "sessions": {}})


def save_ingestion(ledger: dict) -> dict:
    ledger["updatedAt"] = now_iso()
    write_json(INGESTION_PATH, ledger)
    return ledger


def session_content_hash(session: dict) -> str:
    payload = {
        "personaId": session.get("personaId"),
        "messages": [
            {"role": message.get("role"), "content": message.get("content")}
            for message in session.get("messages", [])
        ],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def ingestion_status_for(session: dict, ledger: dict) -> dict:
    content_hash = session_content_hash(session)
    record = ledger.get("sessions", {}).get(session["id"])
    if not record:
        status = "not_ingested"
    elif record.get("contentHash") == content_hash:
        status = "up_to_date"
    else:
        status = "changed"
    return {
        "sessionId": session["id"],
        "status": status,
        "messageCount": len(session.get("messages", [])),
        "contentHash": content_hash,
        "lastIngestedAt": record.get("lastIngestedAt") if record else None,
        "itemsAdded": record.get("itemsAdded") if record else 0,
    }


def extract_json_object(text: str) -> dict:
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return {"items": []}
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return {"items": []}


def extract_knowledge_from_session(session: dict) -> list[dict]:
    if not session.get("messages"):
        return []
    extraction_input = json.dumps({
        "session": {
            "id": session.get("id"),
            "gist": session.get("gist"),
            "personaId": session.get("personaId"),
            "personaName": session.get("personaName"),
        },
        "messages": [
            {"id": str(index), "role": message.get("role"), "content": message.get("content")}
            for index, message in enumerate(session.get("messages", []))
        ],
    })
    response_text = openai_response(EXTRACTION_INSTRUCTIONS, extraction_input, model=DEFAULT_MODEL)
    parsed = extract_json_object(response_text)
    return [
        {**item, "sourceSessionId": session["id"], "personaId": session.get("personaId")}
        for item in parsed.get("items", [])
        if isinstance(item, dict)
    ]


def build_knowledge(session_id: str | None = None, force: bool = False) -> dict:
    sessions = [require_session(session_id)] if session_id else list_sessions()
    ledger = load_ingestion()
    ledger.setdefault("sessions", {})
    extracted_count = 0
    added_count = 0
    skipped_count = 0
    processed_sessions = []
    skipped_sessions = []
    for session in sessions:
        status = ingestion_status_for(session, ledger)
        if status["status"] == "up_to_date" and not force:
            skipped_count += 1
            skipped_sessions.append(session["id"])
            continue
        candidates = extract_knowledge_from_session(session)
        added = add_knowledge_candidates(candidates)
        extracted_count += len(candidates)
        added_count += len(added)
        processed_sessions.append(session["id"])
        ledger["sessions"][session["id"]] = {
            "sessionId": session["id"],
            "messageCount": len(session.get("messages", [])),
            "lastMessageAt": session.get("messages", [{}])[-1].get("createdAt") if session.get("messages") else None,
            "contentHash": status["contentHash"],
            "lastIngestedAt": now_iso(),
            "itemsAdded": len(added),
        }
    save_ingestion(ledger)
    return {
        "extractedCount": extracted_count,
        "addedCount": added_count,
        "skippedCount": skipped_count,
        "processedSessions": processed_sessions,
        "skippedSessions": skipped_sessions,
    }


def export_training_data() -> dict:
    approved = list_knowledge("approved")
    TRAINING_EXPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    records = []
    for item in approved:
        records.append({
            "messages": [
                {"role": "system", "content": "Use approved project memory to answer consistently."},
                {"role": "user", "content": f"Remember this {item.get('type')} for future conversations."},
                {"role": "assistant", "content": item.get("text", "")},
            ],
            "metadata": {
                "knowledgeId": item.get("id"),
                "type": item.get("type"),
                "sourceSessionId": item.get("sourceSessionId"),
                "personaId": item.get("personaId"),
            },
        })
    TRAINING_EXPORT_PATH.write_text("\n".join(json.dumps(record) for record in records) + ("\n" if records else ""), encoding="utf-8")
    return {"outputPath": str(TRAINING_EXPORT_PATH), "recordCount": len(records)}


def master_clear(target: str, confirmation: str) -> dict:
    required = {
        "memory": "CONFIRM_CLEAR_MEMORY",
        "chats": "CONFIRM_CLEAR_CHATS",
        "all": "CONFIRM_CLEAR_ALL",
    }
    if target not in required:
        raise HttpError(400, "Target must be memory, chats, or all.")
    if confirmation != required[target]:
        raise HttpError(400, f"Confirmation required: {required[target]}")
    if target in {"memory", "all"}:
        clear_knowledge()
        clear_qa()
        save_ingestion({"version": 1, "updatedAt": now_iso(), "sessions": {}})
    if target in {"chats", "all"}:
        clear_sessions()
    return {"cleared": target}


class AgentRequestHandler(BaseHTTPRequestHandler):
    server_version = "MyAgentPython/0.1"

    def log_message(self, format_string, *args):
        return

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def do_DELETE(self):
        self.handle_request()

    def handle_request(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path.startswith("/api/"):
                self.handle_api(parsed)
                return
            self.serve_static(parsed.path)
        except HttpError as error:
            append_log("error", "request_failed", {"method": self.command, "url": self.path, "status": error.status, "message": str(error)})
            self.send_json(error.status, {"error": str(error)})
        except Exception as error:
            append_log("error", "request_failed", {"method": self.command, "url": self.path, "status": 500, "message": str(error), "stack": traceback.format_exc()})
            self.send_json(500, {"error": str(error)})

    def handle_api(self, parsed):
        route = f"{self.command} {parsed.path}"
        query = urllib.parse.parse_qs(parsed.query)
        if route == "GET /api/personas":
            self.send_json(200, {"personas": PERSONAS})
            return
        if route == "GET /api/sessions":
            self.send_json(200, {"sessions": list_sessions()})
            return
        if route == "POST /api/sessions":
            body = self.read_json_body()
            session = create_session(body.get("personaId"))
            append_log("info", "session_created", {"sessionId": session["id"], "personaId": session.get("personaId")})
            self.send_json(200, {"session": session})
            return
        if route == "POST /api/chat":
            self.handle_chat()
            return
        session_match = re.match(r"^/api/sessions/([^/]+)$", parsed.path)
        if self.command == "GET" and session_match:
            self.send_json(200, {"session": require_session(session_match.group(1))})
            return
        if self.command == "DELETE" and session_match:
            deleted = delete_session(session_match.group(1))
            if not deleted:
                raise HttpError(404, "Session not found.")
            append_log("info", "session_deleted", {"sessionId": deleted["id"]})
            self.send_json(200, {"deleted": deleted})
            return
        rename_match = re.match(r"^/api/sessions/([^/]+)/rename$", parsed.path)
        if self.command == "POST" and rename_match:
            body = self.read_json_body()
            session = rename_session(rename_match.group(1), body.get("title", ""))
            if not session:
                raise HttpError(404, "Session not found.")
            append_log("info", "session_renamed", {"sessionId": session["id"], "title": session.get("title")})
            self.send_json(200, {"session": session})
            return
        clear_match = re.match(r"^/api/sessions/([^/]+)/clear$", parsed.path)
        if self.command == "POST" and clear_match:
            session = require_session(clear_match.group(1))
            session["messages"] = []
            session = save_session(session)
            append_log("info", "session_cleared", {"sessionId": session["id"]})
            self.send_json(200, {"session": session})
            return
        if route == "POST /api/memory/build":
            database = build_qa_from_sessions()
            append_log("info", "qa_index_built", {"recordCount": database["recordCount"]})
            self.send_json(200, {"recordCount": database["recordCount"]})
            return
        if route == "GET /api/memory/search":
            self.send_json(200, {"results": search_qa(query.get("q", [""])[0])})
            return
        if route == "GET /api/memory/stats":
            self.send_json(200, {"stats": qa_stats()})
            return
        if route == "GET /api/knowledge":
            self.send_json(200, {"items": list_knowledge(query.get("status", [None])[0])})
            return
        if route == "POST /api/knowledge/build":
            body = self.read_json_body()
            result = build_knowledge(body.get("sessionId"), force=bool(body.get("force")))
            append_log("info", "knowledge_extracted", result)
            self.send_json(200, result)
            return
        if route == "GET /api/knowledge/ingestion":
            ledger = load_ingestion()
            self.send_json(200, {"sessions": [ingestion_status_for(session, ledger) for session in list_sessions()]})
            return
        if route == "GET /api/knowledge/search":
            self.send_json(200, {"results": search_knowledge(query.get("q", [""])[0], status="approved")})
            return
        knowledge_match = re.match(r"^/api/knowledge/([^/]+)/(approve|reject|delete)$", parsed.path)
        if self.command == "POST" and knowledge_match:
            item_id, action = knowledge_match.groups()
            item = delete_knowledge(item_id) if action == "delete" else update_knowledge_status(item_id, "approved" if action == "approve" else "rejected")
            if not item:
                raise HttpError(404, "Knowledge item not found.")
            append_log("info", f"knowledge_{action}", {"id": item_id, "status": item.get("status")})
            self.send_json(200, {"item": item})
            return
        if route == "GET /api/logs":
            self.send_json(200, {"logs": read_logs(int(query.get("limit", ["200"])[0]))})
            return
        if route == "POST /api/master-clear":
            body = self.read_json_body()
            result = master_clear(body.get("target"), body.get("confirmation"))
            append_log("info", "master_clear", {"target": body.get("target")})
            self.send_json(200, result)
            return
        if route == "POST /api/training/export":
            result = export_training_data()
            append_log("info", "training_exported", result)
            self.send_json(200, result)
            return
        raise HttpError(404, "Not found.")

    def handle_chat(self):
        body = self.read_json_body()
        session = require_session(body.get("sessionId", ""))
        message = str(body.get("message", "")).strip()
        if not message:
            raise HttpError(400, "Message is required.")
        memory_matches = search_qa(message, limit=1)
        if memory_matches and memory_matches[0].get("score") == 1:
            session = record_exchange(session, message, memory_matches[0]["answer"], {"source": "qa-memory", "qaRecordId": memory_matches[0]["id"]})
            append_log("info", "chat_answered_from_qa_memory", {"sessionId": session["id"], "qaRecordId": memory_matches[0]["id"]})
            self.send_json(200, {"source": "qa-memory", "answer": memory_matches[0]["answer"], "session": session})
            return
        known_memory = known_memory_text(search_knowledge(message, status="approved", limit=5))
        answer, session = send_agent_message(session, message, known_memory)
        add_qa_exchange(session, message, answer)
        append_log("info", "chat_answered_from_openai", {"sessionId": session["id"], "knownMemory": bool(known_memory)})
        self.send_json(200, {"source": "openai", "answer": answer, "session": session})

    def serve_static(self, request_path: str):
        raw_path = "/index.html" if request_path == "/" else request_path
        safe_path = (PUBLIC_DIR / raw_path.lstrip("/")).resolve()
        if not str(safe_path).startswith(str(PUBLIC_DIR)):
            raise HttpError(403, "Forbidden")
        if not safe_path.exists() or not safe_path.is_file():
            raise HttpError(404, "Not found")
        content = safe_path.read_bytes()
        mime_type = mimetypes.guess_type(str(safe_path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    port = int(os.environ.get("PORT", DEFAULT_PORT))
    server = ThreadingHTTPServer(("127.0.0.1", port), AgentRequestHandler)
    print(f"Agent UI is running at http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
