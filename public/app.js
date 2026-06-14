const state = {
  personas: [],
  currentSession: null,
};

const els = {
  buildKnowledgeButton: document.querySelector("#buildKnowledgeButton"),
  buildMemoryButton: document.querySelector("#buildMemoryButton"),
  chatForm: document.querySelector("#chatForm"),
  clearConfirmation: document.querySelector("#clearConfirmation"),
  clearSessionButton: document.querySelector("#clearSessionButton"),
  clearTarget: document.querySelector("#clearTarget"),
  exportTrainingButton: document.querySelector("#exportTrainingButton"),
  knowledgeList: document.querySelector("#knowledgeList"),
  knowledgeSearchButton: document.querySelector("#knowledgeSearchButton"),
  knowledgeSearchInput: document.querySelector("#knowledgeSearchInput"),
  knowledgeStatus: document.querySelector("#knowledgeStatus"),
  logList: document.querySelector("#logList"),
  masterClearButton: document.querySelector("#masterClearButton"),
  memoryResults: document.querySelector("#memoryResults"),
  memorySearchButton: document.querySelector("#memorySearchButton"),
  memorySearchInput: document.querySelector("#memorySearchInput"),
  memoryStatsButton: document.querySelector("#memoryStatsButton"),
  messageInput: document.querySelector("#messageInput"),
  messages: document.querySelector("#messages"),
  newSessionButton: document.querySelector("#newSessionButton"),
  personaSelect: document.querySelector("#personaSelect"),
  personaText: document.querySelector("#personaText"),
  progressBar: document.querySelector("#progressBar"),
  refreshLogsButton: document.querySelector("#refreshLogsButton"),
  refreshKnowledgeButton: document.querySelector("#refreshKnowledgeButton"),
  refreshSessionsButton: document.querySelector("#refreshSessionsButton"),
  renameSessionButton: document.querySelector("#renameSessionButton"),
  deleteSessionButton: document.querySelector("#deleteSessionButton"),
  sessionList: document.querySelector("#sessionList"),
  sessionMeta: document.querySelector("#sessionMeta"),
  sessionTitle: document.querySelector("#sessionTitle"),
  toast: document.querySelector("#toast"),
  themeToggle: document.querySelector("#themeToggle"),
};

await init();

async function init() {
  bindEvents();
  await loadPersonas();
  await refreshSessions();

  if (!state.currentSession) {
    await createSession();
  }

  await refreshKnowledge();
  await refreshLogs();
}

function bindEvents() {
  setupTheme();
  els.newSessionButton.addEventListener("click", () => createSession());
  els.refreshSessionsButton.addEventListener("click", () => refreshSessions());
  els.refreshKnowledgeButton.addEventListener("click", () => refreshKnowledge());
  els.knowledgeStatus.addEventListener("change", () => refreshKnowledge());
  els.chatForm.addEventListener("submit", sendMessage);
  els.clearSessionButton.addEventListener("click", clearCurrentSession);
  els.renameSessionButton.addEventListener("click", renameCurrentSession);
  els.deleteSessionButton.addEventListener("click", deleteCurrentSession);
  els.buildMemoryButton.addEventListener("click", buildMemory);
  els.memorySearchButton.addEventListener("click", searchMemory);
  els.memoryStatsButton.addEventListener("click", showMemoryStats);
  els.buildKnowledgeButton.addEventListener("click", buildKnowledge);
  els.knowledgeSearchButton.addEventListener("click", searchKnowledge);
  els.exportTrainingButton.addEventListener("click", exportTraining);
  els.masterClearButton.addEventListener("click", masterClear);
  els.refreshLogsButton.addEventListener("click", refreshLogs);
  els.themeToggle.addEventListener("click", toggleTheme);
}

async function loadPersonas() {
  const data = await api("/api/personas");
  state.personas = data.personas;
  els.personaSelect.innerHTML = state.personas
    .map((persona) => `<option value="${escapeHtml(persona.id)}">${escapeHtml(persona.name)}</option>`)
    .join("");
  updatePersonaText();
  els.personaSelect.addEventListener("change", updatePersonaText);
}

async function refreshSessions() {
  const data = await api("/api/sessions");
  renderSessions(data.sessions);

  if (!state.currentSession && data.sessions.length > 0) {
    await loadSession(data.sessions[0].id);
  }
}

async function createSession() {
  const data = await api("/api/sessions", {
    method: "POST",
    body: { personaId: els.personaSelect.value },
  });
  state.currentSession = data.session;
  await refreshSessions();
  renderCurrentSession();
  toast("Started new session.");
}

async function loadSession(id) {
  const data = await api(`/api/sessions/${encodeURIComponent(id)}`);
  state.currentSession = data.session;
  renderCurrentSession();
  await refreshSessions();
}

async function sendMessage(event) {
  event.preventDefault();

  if (!state.currentSession) {
    toast("Create a session first.");
    return;
  }

  const message = els.messageInput.value.trim();

  if (!message) {
    return;
  }

  els.messageInput.value = "";
  appendMessage("user", message);
  setBusy(true, "Thinking...");

  try {
    const data = await api("/api/chat", {
      method: "POST",
      body: {
        sessionId: state.currentSession.id,
        message,
      },
    });
    state.currentSession = data.session;
    appendMessage("assistant", data.answer, data.source);
    renderCurrentSession();
    await refreshSessions();
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

async function clearCurrentSession() {
  if (!state.currentSession) {
    return;
  }

  const data = await api(`/api/sessions/${encodeURIComponent(state.currentSession.id)}/clear`, {
    method: "POST",
  });
  state.currentSession = data.session;
  renderCurrentSession();
  await refreshSessions();
}

async function renameCurrentSession() {
  if (!state.currentSession) {
    return;
  }

  const currentTitle = state.currentSession.title || state.currentSession.gist || "";
  const title = prompt("Rename chat", currentTitle);

  if (title === null) {
    return;
  }

  const data = await api(`/api/sessions/${encodeURIComponent(state.currentSession.id)}/rename`, {
    method: "POST",
    body: { title },
  });
  state.currentSession = data.session;
  renderCurrentSession();
  await refreshSessions();
}

async function deleteCurrentSession() {
  if (!state.currentSession) {
    return;
  }

  const confirmed = confirm(`Delete chat "${state.currentSession.title || state.currentSession.gist}" entirely?`);

  if (!confirmed) {
    return;
  }

  await api(`/api/sessions/${encodeURIComponent(state.currentSession.id)}`, {
    method: "DELETE",
  });
  state.currentSession = null;
  await refreshSessions();

  if (!state.currentSession) {
    await createSession();
  }
}

async function buildMemory() {
  setBusy(true, "Building Q/A memory...");
  try {
    const data = await api("/api/memory/build", { method: "POST" });
    toast(`Built Q/A index with ${data.recordCount} records.`);
    await refreshLogs();
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

async function searchMemory() {
  const query = els.memorySearchInput.value.trim();
  const data = await api(`/api/memory/search?q=${encodeURIComponent(query)}`);
  els.memoryResults.innerHTML = data.results.map(renderQaResult).join("") || empty("No prior answers found.");
}

async function showMemoryStats() {
  const data = await api("/api/memory/stats");
  const stats = data.stats;
  els.memoryResults.innerHTML = `
    <div class="item">
      <div class="item-title">${stats.recordCount} records</div>
      <p class="muted">Updated ${escapeHtml(stats.updatedAt)}</p>
      <p>${escapeHtml((stats.topKeywords || []).map((item) => `${item.keyword}(${item.count})`).join(", ") || "No keywords yet.")}</p>
    </div>
  `;
}

async function buildKnowledge() {
  setBusy(true, "Extracting knowledge...");
  try {
    const data = await api("/api/knowledge/build", {
      method: "POST",
      body: { sessionId: state.currentSession?.id },
    });
    toast(`Extracted ${data.extractedCount}; added ${data.addedCount} pending items.`);
    await refreshKnowledge();
    await refreshLogs();
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
}

async function refreshKnowledge() {
  const status = els.knowledgeStatus.value;
  const data = await api(`/api/knowledge${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  renderKnowledgeItems(data.items);
}

async function searchKnowledge() {
  const query = els.knowledgeSearchInput.value.trim();
  const data = await api(`/api/knowledge/search?q=${encodeURIComponent(query)}`);
  renderKnowledgeItems(data.results);
}

async function updateKnowledge(id, action) {
  await api(`/api/knowledge/${encodeURIComponent(id)}/${action}`, { method: "POST" });
  await refreshKnowledge();
  await refreshLogs();
}

async function exportTraining() {
  const data = await api("/api/training/export", { method: "POST" });
  toast(`Exported ${data.recordCount} records.`);
  await refreshLogs();
}

async function masterClear() {
  const target = els.clearTarget.value;
  const confirmation = els.clearConfirmation.value.trim();

  try {
    await api("/api/master-clear", {
      method: "POST",
      body: { target, confirmation },
    });
    state.currentSession = null;
    els.clearConfirmation.value = "";
    await refreshSessions();

    if (!state.currentSession) {
      await createSession();
    }

    await refreshKnowledge();
    await refreshLogs();
    els.memoryResults.innerHTML = "";
    toast(`Cleared ${target}.`);
  } catch (error) {
    toast(error.message);
  }
}

async function refreshLogs() {
  const data = await api("/api/logs?limit=80");
  renderLogs(data.logs);
}

function renderSessions(sessions) {
  els.sessionList.innerHTML = sessions.map((session) => `
    <button class="item ${state.currentSession?.id === session.id ? "active" : ""}" type="button" data-session-id="${escapeHtml(session.id)}">
      <span class="item-title">${escapeHtml(session.title || session.gist)}</span>
      <span class="muted">${escapeHtml(session.personaName || "Persona")} · ${session.messages?.length || 0} messages</span>
    </button>
  `).join("") || empty("No sessions yet.");

  els.sessionList.querySelectorAll("[data-session-id]").forEach((button) => {
    button.addEventListener("click", () => loadSession(button.dataset.sessionId));
  });
}

function renderCurrentSession() {
  const session = state.currentSession;

  if (!session) {
    els.sessionTitle.textContent = "No session selected";
    els.sessionMeta.textContent = "";
    els.messages.innerHTML = "";
    return;
  }

  els.sessionTitle.textContent = session.title || session.gist;
  els.sessionMeta.textContent = `${session.personaName || "Persona"} · ${session.id}`;
  els.messages.innerHTML = "";
  for (const message of session.messages || []) {
    appendMessage(message.role, message.content, message.metadata?.source);
  }
}

function appendMessage(role, content, source) {
  const div = document.createElement("article");
  div.className = `message ${role}`;
  div.innerHTML = `<span class="role">${escapeHtml(role)}${source ? ` · ${escapeHtml(source)}` : ""}</span>${escapeHtml(content)}`;
  els.messages.append(div);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderKnowledgeItems(items) {
  els.knowledgeList.innerHTML = items.map((item) => `
    <div class="item">
      <div class="item-title">${escapeHtml(item.type)} · ${escapeHtml(item.status)}${item.score ? ` · ${Math.round(item.score * 100)}% match` : ""}</div>
      <p class="full-text">${escapeHtml(item.text)}</p>
      <p class="muted">${escapeHtml(item.id)} · confidence ${escapeHtml(String(item.confidence ?? ""))} · source ${escapeHtml(item.sourceSessionId || "unknown")}</p>
      <div class="item-actions">
        ${item.status === "pending" ? `<button type="button" data-knowledge-action="approve" data-knowledge-id="${escapeHtml(item.id)}">Approve</button>` : ""}
        ${item.status === "pending" ? `<button type="button" data-knowledge-action="reject" data-knowledge-id="${escapeHtml(item.id)}">Reject</button>` : ""}
        <button type="button" data-knowledge-action="delete" data-knowledge-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    </div>
  `).join("") || empty("No knowledge items found.");

  els.knowledgeList.querySelectorAll("[data-knowledge-action]").forEach((button) => {
    button.addEventListener("click", () => updateKnowledge(button.dataset.knowledgeId, button.dataset.knowledgeAction));
  });
}

function renderLogs(logs) {
  els.logList.innerHTML = logs.map((log) => `
    <div class="item log ${escapeHtml(log.level)}">
      <div class="item-title">${escapeHtml(log.event)} · ${escapeHtml(log.level)}</div>
      <p class="muted">${escapeHtml(log.timestamp || "")}</p>
      <pre>${escapeHtml(JSON.stringify(log.details || log.raw || {}, null, 2))}</pre>
    </div>
  `).join("") || empty("No logs yet.");
}

function renderQaResult(result) {
  return `
    <div class="item">
      <div class="item-title">${Math.round(result.score * 100)}% match</div>
      <p><strong>Q:</strong> ${escapeHtml(result.question)}</p>
      <p><strong>A:</strong> ${escapeHtml(result.answer)}</p>
    </div>
  `;
}

function updatePersonaText() {
  const persona = state.personas.find((item) => item.id === els.personaSelect.value);
  els.personaText.textContent = persona?.tagline || "";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  setTimeout(() => els.toast.classList.remove("visible"), 3200);
}

function setBusy(isBusy, label = "Working...") {
  document.body.classList.toggle("busy", isBusy);
  els.progressBar.setAttribute("aria-hidden", String(!isBusy));
  els.messageInput.disabled = isBusy;
  els.chatForm.querySelector("button").disabled = isBusy;
  els.chatForm.querySelector("button").textContent = isBusy ? label : "Send";
}

function setupTheme() {
  const theme = localStorage.getItem("agent-theme") || "light";
  applyTheme(theme);
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("agent-theme", nextTheme);
  applyTheme(nextTheme);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.themeToggle.textContent = theme === "dark" ? "Dark" : "Light";
}

function empty(message) {
  return `<div class="item"><p class="muted">${escapeHtml(message)}</p></div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
