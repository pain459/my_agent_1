const state = {
  personas: [],
  currentSession: null,
};

const els = {
  chatForm: document.querySelector("#chatForm"),
  clearSessionButton: document.querySelector("#clearSessionButton"),
  deleteSessionButton: document.querySelector("#deleteSessionButton"),
  messageInput: document.querySelector("#messageInput"),
  messages: document.querySelector("#messages"),
  newSessionButton: document.querySelector("#newSessionButton"),
  personaSelect: document.querySelector("#personaSelect"),
  personaText: document.querySelector("#personaText"),
  progressBar: document.querySelector("#progressBar"),
  refreshSessionsButton: document.querySelector("#refreshSessionsButton"),
  renameSessionButton: document.querySelector("#renameSessionButton"),
  sessionList: document.querySelector("#sessionList"),
  sessionMeta: document.querySelector("#sessionMeta"),
  sessionTitle: document.querySelector("#sessionTitle"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast"),
};

await init();

async function init() {
  bindEvents();
  await loadPersonas();
  await refreshSessions();

  if (!state.currentSession) {
    await createSession();
  }
}

function bindEvents() {
  setupTheme();
  els.newSessionButton.addEventListener("click", () => createSession());
  els.refreshSessionsButton.addEventListener("click", () => refreshSessions());
  els.chatForm.addEventListener("submit", sendMessage);
  els.clearSessionButton.addEventListener("click", clearCurrentSession);
  els.renameSessionButton.addEventListener("click", renameCurrentSession);
  els.deleteSessionButton.addEventListener("click", deleteCurrentSession);
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
