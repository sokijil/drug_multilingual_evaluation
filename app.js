/* 逆翻訳評価フォーム — 静的サイト版
   05_build_eval_sheet.py と同一の項目セット・列名で回答を集める。
   回答はブラウザの localStorage に自動保存し、最終的にCSVで書き出す。 */

const Q9_CATEGORIES = [
  "用量ミス", "回数ミス", "単位変換ミス", "禁忌の欠落", "注意事項の欠落",
  "適応・効能の誤り", "意味の逆転", "重要情報の欠落", "過剰な情報の追加", "その他",
];

const Q7_OPTIONS = [
  { v: 5, label: "5：意味完全一致" },
  { v: 4, label: "4：ほぼ一致" },
  { v: 3, label: "3：一部ズレ" },
  { v: 2, label: "2：大きなズレ" },
  { v: 1, label: "1：意味が大きく異なる" },
];

const BACKUP_REMINDER_INTERVAL = 15; // この件数だけ新規回答したらバックアップを促す

let ITEMS = [];
let evaluator = null;         // "A" | "B"
let answers = {};             // itemId -> {Q7, Q8, Q9:[...], Q10}
let currentIndex = 0;
let lastBackupAt = null;              // 最終バックアップ日時（ms epoch）
let answeredCountAtCheckpoint = 0;    // 直近のバックアップ／リマインド時点の回答数

const $ = (sel) => document.querySelector(sel);

function storageKey(letter) { return `evalForm_state_${letter}`; }

function loadEvaluatorState(letter) {
  try {
    const raw = localStorage.getItem(storageKey(letter));
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 破損データは無視して初期化 */ }
  return { answers: {}, currentIndex: 0, lastBackupAt: null, answeredCountAtCheckpoint: 0 };
}

function saveState() {
  localStorage.setItem(storageKey(evaluator),
    JSON.stringify({ answers, currentIndex, lastBackupAt, answeredCountAtCheckpoint }));
}

function emptyAnswer() { return { Q7: null, Q8: null, Q9: [], Q10: "" }; }

function getAnswer(id) {
  if (!answers[id]) answers[id] = emptyAnswer();
  return answers[id];
}

function isAnswered(id) {
  const a = answers[id];
  return !!a && a.Q7 !== null && a.Q8 !== null;
}

/* ---------------- 初期化 ---------------- */

async function init() {
  const res = await fetch("items.json");
  ITEMS = await res.json();

  bindStartScreen();
  bindMainScreen();
  bindOverview();
  bindMenu();

  const lastEvaluator = localStorage.getItem("evalForm_evaluator");
  if (lastEvaluator === "A" || lastEvaluator === "B") {
    selectEvaluator(lastEvaluator);
  }
}

function bindStartScreen() {
  document.querySelectorAll("[data-evaluator]").forEach((btn) => {
    btn.addEventListener("click", () => selectEvaluator(btn.dataset.evaluator));
  });
}

function selectEvaluator(letter) {
  evaluator = letter;
  localStorage.setItem("evalForm_evaluator", letter);
  const st = loadEvaluatorState(letter);
  answers = st.answers || {};
  currentIndex = Math.min(st.currentIndex || 0, ITEMS.length - 1);
  lastBackupAt = st.lastBackupAt || null;
  answeredCountAtCheckpoint = st.answeredCountAtCheckpoint || 0;

  $("#startScreen").style.display = "none";
  $("#mainScreen").style.display = "block";
  $("#evaluatorBadge").textContent = `評価者${letter}`;
  populateFilterOptions();
  renderItem(currentIndex);
}

/* ---------------- メイン画面 ---------------- */

function bindMainScreen() {
  $("#btnPrev").addEventListener("click", () => {
    if (currentIndex > 0) renderItem(currentIndex - 1);
  });
  $("#btnNext").addEventListener("click", () => {
    if (currentIndex < ITEMS.length - 1) renderItem(currentIndex + 1);
  });
  $("#btnNextUnanswered").addEventListener("click", goToNextUnanswered);
}

function goToNextUnanswered() {
  const n = ITEMS.length;
  for (let step = 1; step <= n; step++) {
    const idx = (currentIndex + step) % n;
    if (!isAnswered(ITEMS[idx].id)) { renderItem(idx); return; }
  }
  showToast("すべての項目が回答済みです");
}

function renderItem(index) {
  currentIndex = index;
  saveState();
  const item = ITEMS[index];
  const a = getAnswer(item.id);

  $("#progressText").textContent =
    `${index + 1} / ${ITEMS.length}（回答済み ${countAnswered()}）`;
  $("#progressBarInner").style.width = `${((index + 1) / ITEMS.length) * 100}%`;
  $("#btnPrev").disabled = index === 0;
  $("#btnNext").disabled = index === ITEMS.length - 1;

  const highriskChip = item.highrisk && item.highrisk !== "非該当"
    ? `<span class="chip chip-highrisk">⚠ ハイリスク薬：${escapeHtml(item.highrisk)}</span>` : "";

  $("#itemCard").innerHTML = `
    <div class="item-meta">
      <span class="chip chip-id">${item.id}</span>
      <span class="chip">${escapeHtml(item.drug)}</span>
      <span class="chip">${escapeHtml(item.section)}</span>
      <span class="chip">${escapeHtml(item.lang)}</span>
      ${highriskChip}
    </div>

    <div class="text-block source">
      <h3>原文（日本語）</h3>${escapeHtml(item.source)}
    </div>
    <div class="text-block backtranslation">
      <h3>逆翻訳文</h3>${escapeHtml(item.backtranslation)}
    </div>

    <div class="q-block">
      <h3>Q7　原文との意味一致 <span class="q-required">必須</span></h3>
      <div class="q7-options">
        ${Q7_OPTIONS.map(o => `
          <label>
            <input type="radio" name="q7" value="${o.v}" ${a.Q7 === o.v ? "checked" : ""}>
            <span>${o.label}</span>
          </label>`).join("")}
      </div>
    </div>

    <div class="q-block">
      <h3>Q8　危険な誤訳の有無 <span class="q-required">必須</span></h3>
      <details class="q-help">
        <summary>「危険な誤訳」とは？</summary>
        <p>医療上の判断や患者の服薬行動に影響しうる誤りを「危険な誤訳」とします。次のいずれかの誤りが該当します。</p>
        <ul>
          <li>用法・用量、投与方法</li>
          <li>禁忌、重要な注意事項</li>
          <li>副作用、適応・効能</li>
          <li>薬剤名、数値・単位</li>
          <li>頻度・期間などの時間情報</li>
          <li>意味の逆転（可 ↔ 不可 など）</li>
        </ul>
      </details>
      <div class="q8-options">
        <label><input type="radio" name="q8" value="0" ${a.Q8 === 0 ? "checked" : ""}><span>0：なし</span></label>
        <label><input type="radio" name="q8" value="1" ${a.Q8 === 1 ? "checked" : ""}><span>1：あり</span></label>
      </div>
    </div>

    <div class="q-block" id="q9Block" style="display:${a.Q8 === 1 ? "block" : "none"}">
      <h3>Q9　誤訳の種類（複数選択可）</h3>
      <div class="q9-grid">
        ${Q9_CATEGORIES.map(c => `
          <label>
            <input type="checkbox" name="q9" value="${escapeHtml(c)}" ${a.Q9.includes(c) ? "checked" : ""}>
            <span>${escapeHtml(c)}</span>
          </label>`).join("")}
      </div>
    </div>

    <div class="q-block">
      <h3>Q10　コメント（任意）</h3>
      <textarea id="q10Input" placeholder="問題点・修正案・気づいた点など">${escapeHtml(a.Q10)}</textarea>
    </div>
  `;

  document.querySelectorAll('input[name="q7"]').forEach((el) =>
    el.addEventListener("change", () => { a.Q7 = Number(el.value); saveState(); refreshProgress(); }));
  document.querySelectorAll('input[name="q8"]').forEach((el) =>
    el.addEventListener("change", () => {
      a.Q8 = Number(el.value);
      if (a.Q8 === 0) a.Q9 = [];
      $("#q9Block").style.display = a.Q8 === 1 ? "block" : "none";
      saveState(); refreshProgress();
    }));
  document.querySelectorAll('input[name="q9"]').forEach((el) =>
    el.addEventListener("change", () => {
      a.Q9 = Array.from(document.querySelectorAll('input[name="q9"]:checked')).map(x => x.value);
      saveState();
    }));
  $("#q10Input").addEventListener("input", (e) => { a.Q10 = e.target.value; saveState(); });
}

function refreshProgress() {
  $("#progressText").textContent =
    `${currentIndex + 1} / ${ITEMS.length}（回答済み ${countAnswered()}）`;
  checkBackupReminder();
}

function countAnswered() {
  return ITEMS.filter((it) => isAnswered(it.id)).length;
}

function checkBackupReminder() {
  const answered = countAnswered();
  if (answered - answeredCountAtCheckpoint >= BACKUP_REMINDER_INTERVAL) {
    answeredCountAtCheckpoint = answered;
    saveState();
    showToast("こまめに「保存・書き出し」→「バックアップを保存」をおすすめします", 4000);
  }
}

function formatLastBackup() {
  if (!lastBackupAt) return "まだバックアップを保存していません";
  const mins = Math.round((Date.now() - lastBackupAt) / 60000);
  if (mins < 1) return "最終バックアップ：たった今";
  if (mins < 60) return `最終バックアップ：${mins}分前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `最終バックアップ：${hours}時間前`;
  return `最終バックアップ：${Math.round(hours / 24)}日前`;
}

/* ---------------- 一覧オーバーレイ ---------------- */

function bindOverview() {
  $("#btnOverview").addEventListener("click", () => {
    renderOverviewGrid();
    $("#overviewOverlay").style.display = "flex";
  });
  $("#btnCloseOverview").addEventListener("click", () => {
    $("#overviewOverlay").style.display = "none";
  });
  $("#overviewOverlay").addEventListener("click", (e) => {
    if (e.target.id === "overviewOverlay") $("#overviewOverlay").style.display = "none";
  });
  ["filterLang", "filterSection", "filterAnswered"].forEach((id) => {
    $(`#${id}`).addEventListener("change", renderOverviewGrid);
  });
}

function populateFilterOptions() {
  const langs = [...new Set(ITEMS.map((i) => i.lang))];
  const sections = [...new Set(ITEMS.map((i) => i.section))];
  const fill = (sel, values) => {
    const el = $(sel);
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      el.appendChild(opt);
    });
  };
  fill("#filterLang", langs);
  fill("#filterSection", sections);
}

function renderOverviewGrid() {
  const fLang = $("#filterLang").value;
  const fSection = $("#filterSection").value;
  const fAnswered = $("#filterAnswered").value;

  const grid = $("#overviewGrid");
  grid.innerHTML = "";
  ITEMS.forEach((item, idx) => {
    if (fLang && item.lang !== fLang) return;
    if (fSection && item.section !== fSection) return;
    const done = isAnswered(item.id);
    if (fAnswered === "done" && !done) return;
    if (fAnswered === "todo" && done) return;

    const cell = document.createElement("div");
    cell.className = "overview-cell" + (done ? " done" : "") + (idx === currentIndex ? " current" : "");
    cell.textContent = item.id.replace("E", "");
    cell.title = `${item.drug} / ${item.section} / ${item.lang}`;
    cell.addEventListener("click", () => {
      renderItem(idx);
      $("#overviewOverlay").style.display = "none";
    });
    grid.appendChild(cell);
  });
}

/* ---------------- 保存・書き出しメニュー ---------------- */

function bindMenu() {
  $("#btnMenu").addEventListener("click", () => {
    $("#lastBackupText").textContent = formatLastBackup();
    $("#menuOverlay").style.display = "flex";
  });
  $("#btnCloseMenu").addEventListener("click", () => { $("#menuOverlay").style.display = "none"; });
  $("#menuOverlay").addEventListener("click", (e) => {
    if (e.target.id === "menuOverlay") $("#menuOverlay").style.display = "none";
  });

  $("#btnExportCsv").addEventListener("click", exportCsv);
  $("#btnExportJson").addEventListener("click", exportJson);
  $("#fileImport").addEventListener("change", importJson);
  $("#btnSwitchEvaluator").addEventListener("click", () => {
    $("#menuOverlay").style.display = "none";
    $("#mainScreen").style.display = "none";
    $("#startScreen").style.display = "flex";
  });
}

function csvField(v) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function exportCsv() {
  const headers = ["項目ID", "Q7 意味一致", "Q8 危険な誤訳",
    ...Q9_CATEGORIES.map((c) => `Q9 ${c}`), "Q10 コメント"];
  const BOM = String.fromCharCode(0xFEFF);
  const rows = [headers.map(csvField).join(",")];
  ITEMS.forEach((item) => {
    const a = answers[item.id] || emptyAnswer();
    const row = [
      item.id,
      a.Q7 ?? "",
      a.Q8 ?? "",
      ...Q9_CATEGORIES.map((c) => (a.Q9.includes(c) ? "○" : "")),
      a.Q10 || "",
    ];
    rows.push(row.map(csvField).join(","));
  });
  downloadBlob(`評価回答_${evaluator}.csv`, BOM + rows.join("\r\n"), "text/csv;charset=utf-8");
  recordBackup();
  showToast(`評価回答_${evaluator}.csv を保存しました`);
}

function exportJson() {
  const payload = { evaluator, exportedAt: new Date().toISOString(), answers };
  downloadBlob(`評価バックアップ_${evaluator}.json`, JSON.stringify(payload, null, 1),
    "application/json");
  recordBackup();
  showToast(`評価バックアップ_${evaluator}.json を保存しました`);
}

function recordBackup() {
  lastBackupAt = Date.now();
  answeredCountAtCheckpoint = countAnswered();
  saveState();
  $("#lastBackupText").textContent = formatLastBackup();
}

function importJson(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.answers) throw new Error("invalid");
      answers = data.answers;
      saveState();
      renderItem(currentIndex);
      showToast("バックアップを読み込みました");
    } catch (err) {
      showToast("読み込みに失敗しました。ファイルを確認してください");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------- ユーティリティ ---------------- */

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

let toastTimer = null;
function showToast(msg, durationMs) {
  const el = $("#toast");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = "none"; }, durationMs || 2500);
}

init();
