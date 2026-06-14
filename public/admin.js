const els = {
  clearConfirmation: document.querySelector("#clearConfirmation"),
  clearTarget: document.querySelector("#clearTarget"),
  contextResults: document.querySelector("#contextResults"),
  contextSearchButton: document.querySelector("#contextSearchButton"),
  contextSearchInput: document.querySelector("#contextSearchInput"),
  contextStatus: document.querySelector("#contextStatus"),
  logList: document.querySelector("#logList"),
  masterClearButton: document.querySelector("#masterClearButton"),
  personaStats: document.querySelector("#personaStats"),
  progressBar: document.querySelector("#progressBar"),
  rebuildContextButton: document.querySelector("#rebuildContextButton"),
  recentSessions: document.querySelector("#recentSessions"),
  refreshLogsButton: document.querySelector("#refreshLogsButton"),
  refreshStatsButton: document.querySelector("#refreshStatsButton"),
  summaryCards: document.querySelector("#summaryCards"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast"),
};

bindEvents();
setupTheme();
await refreshAll();

function bindEvents() {
  els.refreshStatsButton.addEventListener("click", refreshStats);
  els.rebuildContextButton.addEventListener("click", rebuildContext);
  els.contextSearchButton.addEventListener("click", searchContext);
  els.masterClearButton.addEventListener("click", masterClear);
  els.refreshLogsButton.addEventListener("click", refreshLogs);
  els.themeToggle.addEventListener("click", toggleTheme);
}

async function refreshAll() {
  await Promise.all([refreshStats(), refreshLogs()]);
}

async function refreshStats() {
  const data = await api("/api/stats");
  renderStats(data.stats);
}

async function rebuildContext() {
  await runBusy("Rebuilding index...", async () => {
    const data = await api("/api/session-context/rebuild", { method: "POST" });
    toast(`Indexed ${data.chunkCount} session chunks.`);
    await refreshStats();
    await refreshLogs();
  });
}

async function searchContext() {
  const query = els.contextSearchInput.value.trim();
  const data = await api(`/api/session-context/search?q=${encodeURIComponent(query)}`);
  renderContextResults(data.results);
}

async function masterClear() {
  const target = els.clearTarget.value;
  const confirmation = els.clearConfirmation.value.trim();

  try {
    await api("/api/master-clear", {
      method: "POST",
      body: { target, confirmation },
    });
    els.clearConfirmation.value = "";
    els.contextResults.innerHTML = "";
    await refreshAll();
    toast(`Cleared ${target}.`);
  } catch (error) {
    toast(error.message);
  }
}

async function refreshLogs() {
  const data = await api("/api/logs?limit=120");
  renderLogs(data.logs);
}

function renderStats(stats) {
  const summary = stats.summary || {};
  els.summaryCards.innerHTML = [
    ["Sessions", summary.totalSessions],
    ["Messages", summary.totalMessages],
    ["User Messages", summary.userMessages],
    ["Assistant Messages", summary.assistantMessages],
    ["Indexed Chunks", summary.indexedChunks],
    ["Latest Chat", summary.latestChatAt || "none"],
  ].map(([label, value]) => `
    <div class="metric-card">
      <div class="metric-value">${escapeHtml(value ?? 0)}</div>
      <div class="metric-label">${escapeHtml(label)}</div>
    </div>
  `).join("");

  const index = stats.sessionIndex || {};
  els.contextStatus.innerHTML = `
    <div class="item">
      <div class="item-title">${index.exists ? "Index present" : "Index missing"}</div>
      <p class="muted">${escapeHtml(String(index.chunkCount || 0))} chunks · updated ${escapeHtml(index.updatedAt || "never")}</p>
    </div>
  `;

  els.personaStats.innerHTML = (stats.personas || []).map((persona) => `
    <div class="item">
      <div class="item-title">${escapeHtml(persona.personaName || persona.personaId)}</div>
      <p class="muted">${persona.sessionCount} sessions · ${persona.messageCount} messages</p>
    </div>
  `).join("") || empty("No persona activity yet.");

  els.recentSessions.innerHTML = (stats.recentSessions || []).map((session) => `
    <div class="item">
      <div class="item-title">${escapeHtml(session.title || session.gist || session.id)}</div>
      <p class="muted">${escapeHtml(session.personaName || session.personaId || "unknown")} · ${session.messageCount} messages · ${escapeHtml(session.updatedAt || "")}</p>
    </div>
  `).join("") || empty("No sessions yet.");
}

function renderContextResults(results) {
  els.contextResults.innerHTML = results.map((result) => `
    <div class="item">
      <div class="item-title">${Math.round(result.score * 100)}% match · ${escapeHtml(result.sessionTitle || result.sessionId)}</div>
      <p class="full-text">${escapeHtml(result.preview || result.text || "")}</p>
      <p class="muted">${escapeHtml(result.id)} · ${escapeHtml(result.personaName || result.personaId || "unknown")}</p>
    </div>
  `).join("") || empty("No relevant session context found.");
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

async function runBusy(label, task) {
  setBusy(true, label);
  try {
    await task();
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
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
  document.querySelectorAll("button").forEach((button) => {
    if (button.id !== "themeToggle") {
      button.disabled = isBusy;
    }
  });
  els.rebuildContextButton.textContent = isBusy ? label : "Rebuild Index";
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
