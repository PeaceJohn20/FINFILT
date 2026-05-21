// ============================================================
//  ui.js  —  UI RENDERER  (v2 — uses tx.reasons from engine)
//
//  This file knows about HTML elements and how to update them.
//  It knows nothing about timers or button logic.
//  To change what displays on screen, edit ONLY this file.
//
//  Depends on: engine.js  (must be loaded first)
// ============================================================


// ------------------------------------------------------------
//  1. CHART SETUP  —  mini risk-history sparkline
// ------------------------------------------------------------

const chartCanvas = document.getElementById("risk-chart");
const chartContext = chartCanvas.getContext("2d");
const riskHistory  = [];
const MAX_HISTORY  = 80;

function resizeChart() {
  chartCanvas.width  = chartCanvas.offsetWidth  * devicePixelRatio;
  chartCanvas.height = chartCanvas.offsetHeight * devicePixelRatio;
  chartContext.scale(devicePixelRatio, devicePixelRatio);
}
resizeChart();
window.addEventListener("resize", resizeChart);

function drawChart() {
  const w = chartCanvas.offsetWidth;
  const h = chartCanvas.offsetHeight;
  chartContext.clearRect(0, 0, w, h);

  if (riskHistory.length < 2) return;

  const data = riskHistory.slice(-MAX_HISTORY);
  const step = w / (data.length - 1);

  // Threshold guide lines
  chartContext.strokeStyle = "#1c2d3f";
  chartContext.lineWidth   = 0.5;
  [30, 70].forEach(level => {
    const y = h - (level / 100) * h;
    chartContext.beginPath();
    chartContext.moveTo(0, y);
    chartContext.lineTo(w, y);
    chartContext.stroke();
    chartContext.fillStyle = "#2d4a62";
    chartContext.font      = "8px JetBrains Mono";
    chartContext.fillText(level, 2, y - 2);
  });

  // Score line
  chartContext.beginPath();
  data.forEach((value, i) => {
    const x = i * step;
    const y = h - (value / 100) * h;
    i === 0 ? chartContext.moveTo(x, y) : chartContext.lineTo(x, y);
  });
  chartContext.strokeStyle = "#4d9ef7";
  chartContext.lineWidth   = 1.5;
  chartContext.stroke();

  // Dot at latest value
  const lastValue = data[data.length - 1];
  const lastX     = (data.length - 1) * step;
  const lastY     = h - (lastValue / 100) * h;
  chartContext.beginPath();
  chartContext.arc(lastX, lastY, 3, 0, Math.PI * 2);
  chartContext.fillStyle = lastValue <= 30 ? "#00d68f" : lastValue <= 70 ? "#f5c518" : "#ff4560";
  chartContext.fill();
}


// ------------------------------------------------------------
//  2. COUNTERS
// ------------------------------------------------------------

const counts = { total: 0, safe: 0, suspicious: 0, fraud: 0 };
let alertCount = 0;
let startTime  = Date.now();

function resetCounts() {
  counts.total = counts.safe = counts.suspicious = counts.fraud = 0;
  alertCount   = 0;
  startTime    = Date.now();
  riskHistory.length = 0;
}

function updateKPIs() {
  document.getElementById("k0").textContent = counts.total;
  document.getElementById("k1").textContent = counts.safe;
  document.getElementById("k2").textContent = counts.suspicious;
  document.getElementById("k3").textContent = counts.fraud;
  document.getElementById("txcount").textContent = "TX #" + counts.total;
  document.getElementById("alcnt").textContent   = alertCount + " events";

  const t = counts.total || 1;
  document.getElementById("pct-s").textContent = Math.round(counts.safe       / t * 100) + "%";
  document.getElementById("pct-w").textContent = Math.round(counts.suspicious / t * 100) + "%";
  document.getElementById("pct-f").textContent = Math.round(counts.fraud      / t * 100) + "%";
}


// ------------------------------------------------------------
//  3. RISK ENGINE PANEL  —  left column
// ------------------------------------------------------------

function updateScoreDisplay(tx) {
  document.getElementById("snum").textContent       = tx.totalScore;
  document.getElementById("snum").style.color       = tx.colour;
  document.getElementById("slbl").textContent       = tx.decision;
  document.getElementById("slbl").style.color       = tx.colour;
  document.getElementById("sbar").style.width       = tx.totalScore + "%";
  document.getElementById("sbar").style.background  = tx.colour;
  document.getElementById("smini").textContent      = tx.totalScore + "/100";
  document.getElementById("smini").style.color      = tx.colour;
}

function updateFactorBars(tx) {
  const factors = [
    { index: 0, key: "new_account",     max: RISK_RULES.new_account.points     },
    { index: 1, key: "high_amount",     max: RISK_RULES.high_amount.points     },
    { index: 2, key: "rapid_transfer",  max: RISK_RULES.rapid_transfer.points  },
    { index: 3, key: "night_activity",  max: RISK_RULES.night_activity.points  },
    { index: 4, key: "failed_attempts", max: RISK_RULES.failed_attempts.points }
  ];

  factors.forEach(({ index, key, max }) => {
    const pts  = tx.points[key] || 0;
    const pct  = max > 0 ? (pts / max) * 100 : 0;
    document.getElementById("fb" + index).style.width = pct + "%";
    const label = document.getElementById("fp" + index);
    label.textContent = "+" + pts;
    label.style.color = pts > 0 ? "var(--t2)" : "var(--t3)";
  });
}


// ------------------------------------------------------------
//  4. DECISION ENGINE PANEL  —  right column
// ------------------------------------------------------------

function updateVerdict(tx) {
  const verdictBox = document.getElementById("vbox");
  const labels = {
    SAFE:       "✓  ALLOW",
    SUSPICIOUS: "⚠  FLAG / REVIEW",
    FRAUD:      "✕  BLOCKED"
  };
  verdictBox.textContent = labels[tx.decision];
  verdictBox.className   = "vbox " + tx.decision;
}

function updateAgentState(tx) {
  const actionMap = { SAFE: "PASS", SUSPICIOUS: "ALERT", FRAUD: "BLOCK" };
  const as = tx.agentState;

  document.getElementById("ag0").textContent = tx.type + "  ·  " + tx.corridor.from;
  document.getElementById("ag1").textContent =
    "SCORE: " + tx.totalScore +
    (as ? "  ·  PRESSURE: ×" + as.pressureMultiplier.toFixed(2) : "");
  document.getElementById("ag2").textContent =
    tx.decision + (as ? "  ·  " + as.alertLevel : "");
  document.getElementById("ag3").textContent =
    actionMap[tx.decision] + (as ? "  ·  " + as.profilesLearned + " PROFILES" : "");
}


// ------------------------------------------------------------
//  5. TRANSACTION FEED  —  centre column
// ------------------------------------------------------------

const MAX_TX_ROWS     = 40;
const AVATAR_COLOURS  = ["#1a3050","#1a3028","#301a28","#2a2a14","#14243a","#28143a"];

function getInitials(name) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2);
}

function getTime() {
  return new Date().toTimeString().slice(0, 8);
}

function addTransactionRow(tx, rowNumber) {
  const feed = document.getElementById("tx-feed");
  const row  = document.createElement("div");
  row.className = "tx";

  const avatarColour  = AVATAR_COLOURS[rowNumber % AVATAR_COLOURS.length];
  const corridorLabel = tx.corridor.from + " → " + tx.corridor.to +
    (tx.corridor.cross_region ? "  ·  Cross-Region" : "");

  row.innerHTML = `
    <div class="av" style="background:${avatarColour}">${getInitials(tx.sender)}</div>
    <div>
      <div class="tn">${tx.sender}</div>
      <div class="tm">${tx.type}  ·  ${corridorLabel}  ·  ${getTime()}</div>
    </div>
    <div class="ta2" style="color:${tx.colour}">${tx.amountLabel}</div>
    <div class="ts"  style="color:${tx.colour}">${tx.totalScore}</div>
    <div class="badge ${tx.decision}">${tx.decision}</div>
  `;

  feed.insertBefore(row, feed.firstChild);
  if (feed.children.length > MAX_TX_ROWS) feed.lastChild.remove();
}


// ------------------------------------------------------------
//  6. ALERT FEED  —  right column
//
//  Now powered by tx.reasons (built by engine.js).
//
//  For SAFE:       shows the customer message (cleared OK).
//  For SUSPICIOUS: shows ops reasons + customer message.
//  For FRAUD:      shows ops reasons + customer message + ref.
//
//  The compliance record is silently available on tx.reasons.complianceRecord
//  for any downstream audit log — it is NOT displayed in the UI.
// ------------------------------------------------------------

const MAX_ALERT_ROWS = 25;

function addAlertCard(tx) {
  const feed = document.getElementById("alert-feed");

  const actionLabels = {
    SAFE:       "→ SETTLED",
    SUSPICIOUS: "→ MANUAL REVIEW",
    FRAUD:      "→ BLOCKED + INCIDENT LOGGED"
  };

  // Pull from engine-generated reason codes
  const reasons  = tx.reasons;
  const opsLines = reasons.opsReasons.slice(0, 3);  // top 3 ops signals

  // Build the alert body shown in the feed
  let alertBody = "";

  if (tx.decision === "SAFE") {
    // Safe transactions: brief confirmation
    alertBody = reasons.customerMessage;

  } else if (tx.decision === "SUSPICIOUS") {
    // Suspicious: show ops signals + what the customer would see
    alertBody =
      (opsLines.length
        ? opsLines.join(" · ") + "<br>"
        : "") +
      "<span style='color:var(--t3);font-size:8px'>CUSTOMER MSG: " +
      reasons.customerMessage + "</span>";

  } else {
    // FRAUD: show top ops signals, customer message, and reference
    alertBody =
      (opsLines.length
        ? opsLines.join(" · ") + "<br>"
        : "") +
      "<span style='color:var(--t3);font-size:8px'>CUSTOMER MSG: " +
      reasons.customerMessage + "</span><br>" +
      "<span style='color:var(--t3);font-size:8px'>REF: " + tx.ref + "</span>";
  }

  const card = document.createElement("div");
  card.className = "al " + tx.decision;
  card.innerHTML = `
    <div class="alh">
      <span class="alt ${tx.decision}">${tx.decision}</span>
      <span class="altime">${getTime()}</span>
    </div>
    <div class="alm">${alertBody}</div>
    <div class="ala">${actionLabels[tx.decision]}</div>
  `;

  feed.insertBefore(card, feed.firstChild);
  if (feed.children.length > MAX_ALERT_ROWS) feed.lastChild.remove();
  alertCount++;
}


// ------------------------------------------------------------
//  7. LATENCY BAR
// ------------------------------------------------------------

function updateLatency(riskMs, uiMs) {
  document.getElementById("l1").textContent = riskMs + "ms";
  document.getElementById("l2").textContent = uiMs   + "ms";
  document.getElementById("l3").textContent = (riskMs + uiMs) + "ms";
  document.getElementById("lat-inline").textContent = riskMs + "ms";

  const elapsedMinutes = (Date.now() - startTime) / 60000;
  const tpm = elapsedMinutes > 0 ? Math.round(counts.total / elapsedMinutes) : 0;
  document.getElementById("l4").textContent = tpm;
}


// ------------------------------------------------------------
//  8. FULL RENDER  —  called once per transaction tick
// ------------------------------------------------------------

function renderTransaction(tx) {
  const t0 = performance.now();

  counts.total++;
  if      (tx.decision === "SAFE")       counts.safe++;
  else if (tx.decision === "SUSPICIOUS") counts.suspicious++;
  else                                   counts.fraud++;

  riskHistory.push(tx.totalScore);
  if (riskHistory.length > MAX_HISTORY * 2) riskHistory.splice(0, MAX_HISTORY);

  updateKPIs();
  updateScoreDisplay(tx);
  updateFactorBars(tx);
  updateVerdict(tx);
  updateAgentState(tx);
  addTransactionRow(tx, counts.total);
  addAlertCard(tx);
  drawChart();

  const uiMs   = Math.round(performance.now() - t0);
  const riskMs = randomInt(1, 9);
  updateLatency(riskMs, uiMs);
}


// ------------------------------------------------------------
//  9. CLEAR SCREEN
// ------------------------------------------------------------

function clearScreen() {
  document.getElementById("tx-feed").innerHTML    = "";
  document.getElementById("alert-feed").innerHTML = "";
  resetCounts();
  updateKPIs();
  document.getElementById("snum").textContent = "—";
  document.getElementById("slbl").textContent = "AWAITING TX";
  document.getElementById("slbl").style.color = "var(--t3)";
  document.getElementById("pct-s").textContent = "0%";
  document.getElementById("pct-w").textContent = "0%";
  document.getElementById("pct-f").textContent = "0%";
  drawChart();
}
