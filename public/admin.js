const els = {
  approvedList: document.querySelector("#approvedList"),
  clearConfirmation: document.querySelector("#clearConfirmation"),
  clearTarget: document.querySelector("#clearTarget"),
  discardList: document.querySelector("#discardList"),
  exportTrainingButton: document.querySelector("#exportTrainingButton"),
  extractKnowledgeButton: document.querySelector("#extractKnowledgeButton"),
  flushDiscardButton: document.querySelector("#flushDiscardButton"),
  forceKnowledgeBuild: document.querySelector("#forceKnowledgeBuild"),
  ingestionList: document.querySelector("#ingestionList"),
  knowledgeSearchButton: document.querySelector("#knowledgeSearchButton"),
  knowledgeSearchInput: document.querySelector("#knowledgeSearchInput"),
  logList: document.querySelector("#logList"),
  masterClearButton: document.querySelector("#masterClearButton"),
  progressBar: document.querySelector("#progressBar"),
  refreshIngestionButton: document.querySelector("#refreshIngestionButton"),
  refreshApprovedButton: document.querySelector("#refreshApprovedButton"),
  refreshLogsButton: document.querySelector("#refreshLogsButton"),
  refreshReviewButton: document.querySelector("#refreshReviewButton"),
  reviewList: document.querySelector("#reviewList"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast"),
};

bindEvents();
setupTheme();
await refreshAll();

function bindEvents() {
  els.extractKnowledgeButton.addEventListener("click", extractKnowledge);
  els.refreshIngestionButton.addEventListener("click", refreshIngestion);
  els.refreshApprovedButton.addEventListener("click", refreshApproved);
  els.refreshReviewButton.addEventListener("click", refreshReview);
  els.knowledgeSearchButton.addEventListener("click", searchKnowledge);
  els.flushDiscardButton.addEventListener("click", flushDiscard);
  els.exportTrainingButton.addEventListener("click", exportTraining);
  els.masterClearButton.addEventListener("click", masterClear);
  els.refreshLogsButton.addEventListener("click", refreshLogs);
  els.themeToggle.addEventListener("click", toggleTheme);
}

async function refreshAll() {
  await Promise.all([
    refreshIngestion(),
    refreshReview(),
    refreshApproved(),
    refreshDiscard(),
    refreshLogs(),
  ]);
}

async function extractKnowledge() {
  await runBusy("Extracting knowledge...", async () => {
    const data = await api("/api/knowledge/extract", {
      method: "POST",
      body: { force: els.forceKnowledgeBuild.checked },
    });
    toast(`Extracted ${data.extractedCount}; queued ${data.addedCount}; skipped ${data.skippedCount}.`);
    await Promise.all([refreshIngestion(), refreshReview(), refreshLogs()]);
  });
}

async function refreshIngestion() {
  const data = await api("/api/knowledge/ingestion");
  els.ingestionList.innerHTML = data.sessions.map((session) => `
    <div class="item">
      <div class="item-title">${escapeHtml(session.sessionId)} · ${escapeHtml(session.status)}</div>
      <p class="muted">${session.messageCount} messages · queued ${session.itemsAdded || 0} · ${escapeHtml(session.lastIngestedAt || "never ingested")}</p>
    </div>
  `).join("") || empty("No sessions found.");
}

async function refreshReview() {
  const data = await api("/api/knowledge/review");
  renderReview(data.items);
}

async function reviewAction(id, action) {
  await api(`/api/knowledge/review/${encodeURIComponent(id)}/${action}`, { method: "POST" });
  await Promise.all([refreshReview(), refreshApproved(), refreshDiscard(), refreshLogs()]);
}

async function refreshApproved() {
  const data = await api("/api/knowledge/approved");
  renderApproved(data.items);
}

async function searchKnowledge() {
  const query = els.knowledgeSearchInput.value.trim();
  const data = await api(`/api/knowledge/search?q=${encodeURIComponent(query)}`);
  renderApproved(data.results);
}

async function refreshDiscard() {
  const data = await api("/api/discard-bin");
  renderDiscard(data.items);
}

async function flushDiscard() {
  await runBusy("Flushing discarded data...", async () => {
    const data = await api("/api/discard-bin/flush", { method: "POST" });
    toast(`Discard bin flushed. ${data.itemCount} items remain.`);
    await Promise.all([refreshDiscard(), refreshLogs()]);
  });
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

function renderReview(items) {
  els.reviewList.innerHTML = items.map((item) => `
    <div class="item">
      <div class="item-title">${escapeHtml(item.type)} · confidence ${escapeHtml(String(item.confidence ?? ""))}</div>
      <p><strong>Question:</strong> ${escapeHtml(item.sourceQuestion || "")}</p>
      <p><strong>Answer:</strong> ${escapeHtml(item.sourceAnswer || "")}</p>
      <p class="full-text"><strong>Extracted:</strong> ${escapeHtml(item.text)}</p>
      <p class="muted">${escapeHtml(item.id)} · source ${escapeHtml(item.sourceSessionId || "unknown")}</p>
      <div class="item-actions">
        <button type="button" data-review-action="approve" data-review-id="${escapeHtml(item.id)}">Approve</button>
        <button type="button" data-review-action="reject" data-review-id="${escapeHtml(item.id)}">Reject</button>
      </div>
    </div>
  `).join("") || empty("No review candidates queued.");

  els.reviewList.querySelectorAll("[data-review-action]").forEach((button) => {
    button.addEventListener("click", () => reviewAction(button.dataset.reviewId, button.dataset.reviewAction));
  });
}

function renderApproved(items) {
  els.approvedList.innerHTML = items.map((item) => `
    <div class="item">
      <div class="item-title">${escapeHtml(item.type)}${item.score ? ` · ${Math.round(item.score * 100)}% match` : ""}</div>
      <p class="full-text">${escapeHtml(item.text)}</p>
      <p><strong>Source question:</strong> ${escapeHtml(item.sourceQuestion || "")}</p>
      <p class="muted">${escapeHtml(item.id)} · active since ${escapeHtml(item.approvedAt || "")}</p>
    </div>
  `).join("") || empty("No active knowledge yet.");
}

function renderDiscard(items) {
  els.discardList.innerHTML = items.map((item) => `
    <div class="item">
      <div class="item-title">${escapeHtml(item.type)} · rejected</div>
      <p class="full-text">${escapeHtml(item.text)}</p>
      <p><strong>Source question:</strong> ${escapeHtml(item.sourceQuestion || "")}</p>
      <p class="muted">${escapeHtml(item.id)} · rejected ${escapeHtml(item.rejectedAt || "")}</p>
    </div>
  `).join("") || empty("No rejected items waiting to flush.");
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
  els.extractKnowledgeButton.textContent = isBusy ? label : "Extract New/Changed";
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
