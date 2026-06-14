const els = {
  buildKnowledgeButton: document.querySelector("#buildKnowledgeButton"),
  buildMemoryButton: document.querySelector("#buildMemoryButton"),
  clearConfirmation: document.querySelector("#clearConfirmation"),
  clearTarget: document.querySelector("#clearTarget"),
  exportTrainingButton: document.querySelector("#exportTrainingButton"),
  knowledgeList: document.querySelector("#knowledgeList"),
  forceKnowledgeBuild: document.querySelector("#forceKnowledgeBuild"),
  ingestionList: document.querySelector("#ingestionList"),
  knowledgeSearchButton: document.querySelector("#knowledgeSearchButton"),
  knowledgeSearchInput: document.querySelector("#knowledgeSearchInput"),
  knowledgeStatus: document.querySelector("#knowledgeStatus"),
  logList: document.querySelector("#logList"),
  masterClearButton: document.querySelector("#masterClearButton"),
  memoryResults: document.querySelector("#memoryResults"),
  memorySearchButton: document.querySelector("#memorySearchButton"),
  memorySearchInput: document.querySelector("#memorySearchInput"),
  memoryStatsButton: document.querySelector("#memoryStatsButton"),
  progressBar: document.querySelector("#progressBar"),
  refreshKnowledgeButton: document.querySelector("#refreshKnowledgeButton"),
  refreshLogsButton: document.querySelector("#refreshLogsButton"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast"),
};

bindEvents();
setupTheme();
await refreshKnowledge();
await refreshIngestion();
await refreshLogs();

function bindEvents() {
  els.refreshKnowledgeButton.addEventListener("click", () => refreshKnowledge());
  els.knowledgeStatus.addEventListener("change", () => refreshKnowledge());
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

async function buildMemory() {
  await runBusy("Building Q/A memory...", async () => {
    const data = await api("/api/memory/build", { method: "POST" });
    toast(`Built Q/A index with ${data.recordCount} records.`);
    await refreshLogs();
  });
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
  await runBusy("Extracting knowledge...", async () => {
    const data = await api("/api/knowledge/build", {
      method: "POST",
      body: { force: els.forceKnowledgeBuild.checked },
    });
    toast(`Extracted ${data.extractedCount}; added ${data.addedCount}; skipped ${data.skippedCount}.`);
    await refreshKnowledge();
    await refreshIngestion();
    await refreshLogs();
  });
}

async function refreshKnowledge() {
  const status = els.knowledgeStatus.value;
  const data = await api(`/api/knowledge${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  renderKnowledgeItems(data.items);
  await refreshIngestion();
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
    els.clearConfirmation.value = "";
    await refreshKnowledge();
    await refreshLogs();
    els.memoryResults.innerHTML = "";
    toast(`Cleared ${target}.`);
  } catch (error) {
    toast(error.message);
  }
}

async function refreshLogs() {
  const data = await api("/api/logs?limit=120");
  renderLogs(data.logs);
}

async function refreshIngestion() {
  const data = await api("/api/knowledge/ingestion");
  els.ingestionList.innerHTML = data.sessions.map((session) => `
    <div class="item">
      <div class="item-title">${escapeHtml(session.sessionId)} · ${escapeHtml(session.status)}</div>
      <p class="muted">${session.messageCount} messages · added ${session.itemsAdded || 0} · ${escapeHtml(session.lastIngestedAt || "never ingested")}</p>
    </div>
  `).join("") || empty("No sessions found.");
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
  els.buildKnowledgeButton.textContent = isBusy ? label : "Extract From All Sessions";
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
