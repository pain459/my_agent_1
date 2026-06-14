const els = {
  approvedList: document.querySelector("#approvedList"),
  buildQaButton: document.querySelector("#buildQaButton"),
  clearConfirmation: document.querySelector("#clearConfirmation"),
  clearTarget: document.querySelector("#clearTarget"),
  discardList: document.querySelector("#discardList"),
  exportTrainingButton: document.querySelector("#exportTrainingButton"),
  extractKnowledgeButton: document.querySelector("#extractKnowledgeButton"),
  flushDiscardButton: document.querySelector("#flushDiscardButton"),
  forceKnowledgeBuild: document.querySelector("#forceKnowledgeBuild"),
  ingestionList: document.querySelector("#ingestionList"),
  logList: document.querySelector("#logList"),
  masterClearButton: document.querySelector("#masterClearButton"),
  progressBar: document.querySelector("#progressBar"),
  qaResults: document.querySelector("#qaResults"),
  qaSearchButton: document.querySelector("#qaSearchButton"),
  qaSearchInput: document.querySelector("#qaSearchInput"),
  qaStatsButton: document.querySelector("#qaStatsButton"),
  refreshIngestionButton: document.querySelector("#refreshIngestionButton"),
  refreshLogsButton: document.querySelector("#refreshLogsButton"),
  refreshReviewButton: document.querySelector("#refreshReviewButton"),
  reviewList: document.querySelector("#reviewList"),
  runtimeMemoryResults: document.querySelector("#runtimeMemoryResults"),
  runtimeMemorySearchButton: document.querySelector("#runtimeMemorySearchButton"),
  runtimeMemorySearchInput: document.querySelector("#runtimeMemorySearchInput"),
  saveApprovedButton: document.querySelector("#saveApprovedButton"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast"),
};

bindEvents();
setupTheme();
await refreshAll();

function bindEvents() {
  els.buildQaButton.addEventListener("click", buildQa);
  els.qaSearchButton.addEventListener("click", searchQa);
  els.qaStatsButton.addEventListener("click", showQaStats);
  els.extractKnowledgeButton.addEventListener("click", extractKnowledge);
  els.refreshIngestionButton.addEventListener("click", refreshIngestion);
  els.refreshReviewButton.addEventListener("click", refreshReview);
  els.saveApprovedButton.addEventListener("click", saveApprovedToMemory);
  els.runtimeMemorySearchButton.addEventListener("click", searchRuntimeMemory);
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

async function buildQa() {
  await runBusy("Building Q/A cache...", async () => {
    const data = await api("/api/qa/build", { method: "POST" });
    toast(`Built Q/A index with ${data.recordCount} records.`);
    await refreshLogs();
  });
}

async function searchQa() {
  const query = els.qaSearchInput.value.trim();
  const data = await api(`/api/qa/search?q=${encodeURIComponent(query)}`);
  els.qaResults.innerHTML = data.results.map(renderQaResult).join("") || empty("No prior answers found.");
}

async function showQaStats() {
  const data = await api("/api/qa/stats");
  const stats = data.stats;
  els.qaResults.innerHTML = `
    <div class="item">
      <div class="item-title">${stats.recordCount} records</div>
      <p class="muted">Updated ${escapeHtml(stats.updatedAt)}</p>
      <p>${escapeHtml((stats.topKeywords || []).map((item) => `${item.keyword}(${item.count})`).join(", ") || "No keywords yet.")}</p>
    </div>
  `;
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

async function saveApprovedToMemory() {
  await runBusy("Saving to memory...", async () => {
    const data = await api("/api/memory/save-approved", { method: "POST" });
    toast(`Saved ${data.savedCount} approved items to runtime memory.`);
    await Promise.all([refreshApproved(), refreshLogs()]);
    await searchRuntimeMemory();
  });
}

async function searchRuntimeMemory() {
  const query = els.runtimeMemorySearchInput.value.trim();
  const data = await api(`/api/memory/search?q=${encodeURIComponent(query)}`);
  els.runtimeMemoryResults.innerHTML = data.results.map(renderMemoryResult).join("") || empty("No saved memory found.");
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
    els.qaResults.innerHTML = "";
    els.runtimeMemoryResults.innerHTML = "";
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
      <div class="item-title">${escapeHtml(item.type)} · ${item.savedToMemoryAt ? "saved" : "not saved"}</div>
      <p class="full-text">${escapeHtml(item.text)}</p>
      <p><strong>Source question:</strong> ${escapeHtml(item.sourceQuestion || "")}</p>
      <p class="muted">${escapeHtml(item.id)} · approved ${escapeHtml(item.approvedAt || "")}${item.savedToMemoryAt ? ` · saved ${escapeHtml(item.savedToMemoryAt)}` : ""}</p>
    </div>
  `).join("") || empty("No approved knowledge yet.");
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

function renderMemoryResult(result) {
  return `
    <div class="item">
      <div class="item-title">${Math.round(result.score * 100)}% match · ${escapeHtml(result.type || "memory")}</div>
      <p><strong>Trigger:</strong> ${escapeHtml(result.question || "")}</p>
      <p class="full-text"><strong>Local answer:</strong> ${escapeHtml(result.answer || "")}</p>
      <p class="muted">${escapeHtml(result.id)} · knowledge ${escapeHtml(result.knowledgeId || "")}</p>
    </div>
  `;
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
