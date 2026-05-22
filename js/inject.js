// ============================================================
//  inject.js  —  INJECTION CONSOLE  (v1)
//
//  Allows judges / evaluators to craft synthetic transactions
//  and inject them directly into the live engine + UI pipeline.
//
//  HOW IT WORKS:
//    injectTransaction(overrides) bypasses the random generator
//    and builds a transaction with your specified values, then
//    runs it through the FULL engine scoring pipeline (flags,
//    points, correlation multiplier, reason codes, memory).
//
//  The panel attaches itself to the DOM on load.
//  It reads SENDERS, CORRIDORS, TX_TYPES, RISK_RULES and
//  THRESHOLDS directly from engine.js — no duplication.
//
//  Depends on: engine.js + ui.js  (must be loaded before this)
// ============================================================
// ------------------------------------------------------------
//  PRESET SCENARIOS
//  Each preset is a named bundle of overrides that tests a
//  specific fraud pattern the engine should catch.
// ------------------------------------------------------------

const INJECT_PRESETS = [
  {
    id:    "clean",
    label: "✓ Clean Transfer",
    color: "#00d68f",
    desc:  "Low-value, same-region USSD. Should score SAFE.",
    overrides: {
      senderName: "Adaeze Okeke",
      amount:     12500,
      typeName:   "USSD Transfer",
      corridorKey:"Warri → Benin City",
      forceFlags: {}
    }
  },
  {
    id:    "crypto",
    label: "⚡ Crypto Laundering",
    color: "#ff4560",
    desc:  "₦4.5M Crypto Swap cross-region, new account, night hours. Should score FRAUD.",
    overrides: {
      senderName: "Ibrahim Sule",
      amount:     4500000,
      typeName:   "Crypto Swap",
      corridorKey:"Lagos Island → Kano",
      forceFlags: {
        new_account:    true,
        night_activity: true,
        round_amount:   true
      }
    }
  },
  {
    id:    "airtime",
    label: "📱 Airtime Structuring",
    color: "#ff4560",
    desc:  "₦4.9M Airtime Recharge — the known gap. Cross-region. Should be FRAUD.",
    overrides: {
      senderName: "Musa Danjuma",
      amount:     4937119,
      typeName:   "Airtime Recharge",
      corridorKey:"Uyo → Port Harcourt",
      forceFlags: {
        rapid_transfer: true,
        cross_region:   true
      }
    }
  },
  {
    id:    "velocity",
    label: "🔁 Velocity Bomb",
    color: "#f5c518",
    desc:  "Forces velocity_breach + failed_attempts on a known sender. Should FLAG or BLOCK.",
    overrides: {
      senderName: "Yusuf Garba",
      amount:     850000,
      typeName:   "Bank Transfer",
      corridorKey:"Maiduguri → Abuja FCT",
      forceFlags: {
        velocity_breach:  true,
        failed_attempts:  true,
        cross_region:     true,
        night_activity:   true
      }
    }
  },
  {
    id:    "mule",
    label: "🕵 Account Mule",
    color: "#ff4560",
    desc:  "New account, high-risk zone, round ₦1M, rapid transfer. Structuring signature.",
    overrides: {
      senderName: "Hauwa Usman",
      amount:     1000000,
      typeName:   "Agent Banking",
      corridorKey:"Aba → Lagos Island",
      forceFlags: {
        new_account:    true,
        rapid_transfer: true,
        high_risk_zone: true,
        round_amount:   true
      }
    }
  }
];


// ------------------------------------------------------------
//  CORE INJECTION FUNCTION
//  Builds and scores a transaction using engine internals,
//  but substitutes judge-specified values where provided.
// ------------------------------------------------------------

function injectTransaction(overrides) {

  // --- Resolve corridor ---
  const corridor = CORRIDORS.find(c =>
    (c.from + " → " + c.to) === overrides.corridorKey
  ) || CORRIDORS[0];

  // --- Resolve zone ---
  const originZone = ZONES.find(z => z.name === corridor.from) || ZONES[0];

  // --- Resolve tx type ---
  const txType = TX_TYPES.find(t => t.name === overrides.typeName) || TX_TYPES[0];

  // --- Resolve sender ---
  const sender = overrides.senderName || SENDERS[0];

  // --- Resolve amount ---
  const amount = parseInt(overrides.amount) || 50000;

  // --- Agent memory checks (real engine checks) ---
  const velocityBreach  = overrides.forceFlags.velocity_breach  !== undefined
    ? overrides.forceFlags.velocity_breach
    : AgentMemory.checkVelocity(sender);

  const behaviourChange = overrides.forceFlags.behaviour_change !== undefined
    ? overrides.forceFlags.behaviour_change
    : AgentMemory.checkBehaviourChange(sender, amount);

  const repeatFraud = overrides.forceFlags.repeat_fraud !== undefined
    ? overrides.forceFlags.repeat_fraud
    : AgentMemory.checkRepeatFraud(sender);

  // --- Build flags: engine logic first, then overrides on top ---
  const flags = {
    new_account:      overrides.forceFlags.new_account      !== undefined
                        ? overrides.forceFlags.new_account
                        : false,
    high_amount:      amount >= HIGH_AMOUNT_THRESHOLD,
    rapid_transfer:   overrides.forceFlags.rapid_transfer   !== undefined
                        ? overrides.forceFlags.rapid_transfer
                        : false,
    night_activity:   overrides.forceFlags.night_activity   !== undefined
                        ? overrides.forceFlags.night_activity
                        : false,
    failed_attempts:  overrides.forceFlags.failed_attempts  !== undefined
                        ? overrides.forceFlags.failed_attempts
                        : false,
    high_risk_zone:   overrides.forceFlags.high_risk_zone   !== undefined
                        ? overrides.forceFlags.high_risk_zone
                        : originZone.risk_modifier > 8,
    cross_region:     corridor.cross_region,
    round_amount:     overrides.forceFlags.round_amount      !== undefined
                        ? overrides.forceFlags.round_amount
                        : isRoundAmount(amount),
    high_risk_type:   txType.risk_bonus > 0,
    velocity_breach:  velocityBreach,
    behaviour_change: behaviourChange,
    repeat_fraud:     repeatFraud
  };

  // --- Score points (same logic as engine) ---
  const points = {
    new_account:      flags.new_account      ? RISK_RULES.new_account.points      : 0,
    high_amount:      flags.high_amount      ? getAmountPoints(amount)             : 0,
    rapid_transfer:   flags.rapid_transfer   ? RISK_RULES.rapid_transfer.points   : 0,
    night_activity:   flags.night_activity   ? RISK_RULES.night_activity.points   : 0,
    failed_attempts:  flags.failed_attempts  ? RISK_RULES.failed_attempts.points  : 0,
    high_risk_zone:   flags.high_risk_zone   ? RISK_RULES.high_risk_zone.points   : 0,
    cross_region:     flags.cross_region     ? RISK_RULES.cross_region.points     : 0,
    round_amount:     flags.round_amount     ? RISK_RULES.round_amount.points     : 0,
    high_risk_type:   flags.high_risk_type   ? txType.risk_bonus                  : 0,
    velocity_breach:  flags.velocity_breach  ? RISK_RULES.velocity_breach.points  : 0,
    behaviour_change: flags.behaviour_change ? RISK_RULES.behaviour_change.points : 0,
    repeat_fraud:     flags.repeat_fraud     ? RISK_RULES.repeat_fraud.points     : 0
  };

  const correlationMultiplier = getCorrelationMultiplier(flags);
  const pressureMultiplier    = AgentMemory.pressureMultiplier;
  const baseScore             = Object.values(points).reduce((s, p) => s + p, 0);
  const totalScore            = Math.min(100, Math.round(baseScore * correlationMultiplier * pressureMultiplier));
  const decision              = getDecision(totalScore);

  const tx = {
    ref:         "INJ-" + generateTxRef(),   // prefix makes injected tx identifiable in logs
    sender,
    type:        txType.name,
    amount,
    amountLabel: formatAmount(amount),
    corridor: {
      from:         corridor.from,
      to:           corridor.to,
      cross_region: corridor.cross_region,
      region:       originZone.region
    },
    flags,
    points,
    correlationMultiplier,
    pressureMultiplier,
    totalScore,
    decision,
    colour:  getColour(totalScore),
    reasons: null,
    agentState: null,
    injected: true   // mark as judge-injected
  };

  tx.reasons    = buildReasonCodes(tx);
  AgentMemory.updateProfile(sender, tx);
  AgentMemory.updatePressure(decision);
  tx.agentState = AgentMemory.getState();

  return tx;
}


// ------------------------------------------------------------
//  BUILD & MOUNT THE PANEL
// ------------------------------------------------------------

function mountInjectionPanel() {

  // Gather corridor options for the dropdown
  const corridorOptions = CORRIDORS.map(c =>
    `<option value="${c.from} → ${c.to}">${c.from} → ${c.to}${c.cross_region ? " ✕" : ""}</option>`
  ).join("");

  // Gather tx type options
  const typeOptions = TX_TYPES.map(t =>
    `<option value="${t.name}">${t.name}${t.risk_bonus > 0 ? " ⚠" : ""}</option>`
  ).join("");

  // Gather sender options
  const senderOptions = SENDERS.map(s =>
    `<option value="${s}">${s}</option>`
  ).join("");

  // Build preset buttons
  const presetButtons = INJECT_PRESETS.map(p => `
    <button
      class="inj-preset"
      style="border-color:${p.color};color:${p.color}"
      title="${p.desc}"
      onclick="applyPreset('${p.id}')"
    >${p.label}</button>
  `).join("");

  const flagKeys = [
    "new_account","rapid_transfer","night_activity",
    "failed_attempts","high_risk_zone","round_amount",
    "velocity_breach","behaviour_change","repeat_fraud"
  ];

  const flagCheckboxes = flagKeys.map(k => `
    <label class="inj-flag-label">
      <input type="checkbox" id="flag-${k}" class="inj-flag-cb">
      <span>${k.replace(/_/g," ")}</span>
    </label>
  `).join("");

  const panelHTML = `
<div id="inj-panel" class="inj-panel">

  <!-- TOGGLE BUTTON (always visible) -->
  <button id="inj-toggle" class="inj-toggle" onclick="toggleInjPanel()" title="Judge Injection Console">
    <span class="inj-toggle-icon">⚗</span>
    <span class="inj-toggle-label">INJECT</span>
  </button>

  <!-- PANEL BODY -->
  <div id="inj-body" class="inj-body" style="display:none">
    <div class="inj-header">
      <span class="inj-title">⚗ INJECTION CONSOLE</span>
      <button class="inj-close" onclick="toggleInjPanel()">✕</button>
    </div>

    <div class="inj-section-label">PRESETS</div>
    <div class="inj-presets">${presetButtons}</div>

    <div class="inj-divider"></div>
    <div class="inj-section-label">TRANSACTION DETAILS</div>

    <div class="inj-row">
      <label class="inj-label">SENDER</label>
      <select id="inj-sender" class="inj-select">${senderOptions}</select>
    </div>

    <div class="inj-row">
      <label class="inj-label">AMOUNT (₦)</label>
      <input id="inj-amount" type="number" class="inj-input" value="50000" min="500" max="10000000" step="500">
    </div>

    <div class="inj-row">
      <label class="inj-label">TX TYPE</label>
      <select id="inj-type" class="inj-select">${typeOptions}</select>
    </div>

    <div class="inj-row">
      <label class="inj-label">CORRIDOR <span style="color:var(--t3);font-size:9px">✕=cross-region</span></label>
      <select id="inj-corridor" class="inj-select">${corridorOptions}</select>
    </div>

    <div class="inj-divider"></div>
    <div class="inj-section-label">FORCE FLAGS <span style="color:var(--t3);font-size:9px">(override engine)</span></div>
    <div class="inj-flags">${flagCheckboxes}</div>

    <div class="inj-divider"></div>

    <!-- LIVE SCORE PREVIEW -->
    <div class="inj-preview" id="inj-preview">
      <span class="inj-preview-label">PREDICTED SCORE</span>
      <span class="inj-preview-score" id="inj-pscore">—</span>
      <span class="inj-preview-verdict" id="inj-pverdict">SET VALUES ABOVE</span>
    </div>

    <button class="inj-fire" id="inj-fire-btn" onclick="fireInjection()">
      ▶  INJECT TRANSACTION
    </button>

    <div class="inj-note">
      Injected transactions run through the full engine pipeline.<br>
      Refs are prefixed <span style="color:var(--warn)">INJ-</span> in compliance logs.
    </div>
  </div>
</div>`;

  document.body.insertAdjacentHTML("beforeend", panelHTML);
  injectStyles();
  wirePreviewListeners();
}


// ------------------------------------------------------------
//  PANEL INTERACTIONS
// ------------------------------------------------------------

function toggleInjPanel() {
  const body = document.getElementById("inj-body");
  const isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "flex";
  updatePreview();
}

function applyPreset(id) {
  const preset = INJECT_PRESETS.find(p => p.id === id);
  if (!preset) return;
  const o = preset.overrides;

  document.getElementById("inj-sender").value   = o.senderName;
  document.getElementById("inj-amount").value   = o.amount;
  document.getElementById("inj-type").value     = o.typeName;
  document.getElementById("inj-corridor").value = o.corridorKey;

  // Reset all checkboxes, then apply forced flags
  document.querySelectorAll(".inj-flag-cb").forEach(cb => cb.checked = false);
  Object.entries(o.forceFlags).forEach(([key, val]) => {
    const cb = document.getElementById("flag-" + key);
    if (cb) cb.checked = val;
  });

  updatePreview();
}

function getInjectionOverrides() {
  const forceFlags = {};
  document.querySelectorAll(".inj-flag-cb").forEach(cb => {
    const key = cb.id.replace("flag-", "");
    if (cb.checked) forceFlags[key] = true;
  });

  return {
    senderName:   document.getElementById("inj-sender").value,
    amount:       parseInt(document.getElementById("inj-amount").value),
    typeName:     document.getElementById("inj-type").value,
    corridorKey:  document.getElementById("inj-corridor").value,
    forceFlags
  };
}

function updatePreview() {
  try {
    const overrides = getInjectionOverrides();
    if (!overrides.amount || overrides.amount < 1) return;

    // Dry-run: compute score without touching agent memory
    const corridor   = CORRIDORS.find(c => (c.from + " → " + c.to) === overrides.corridorKey) || CORRIDORS[0];
    const originZone = ZONES.find(z => z.name === corridor.from) || ZONES[0];
    const txType     = TX_TYPES.find(t => t.name === overrides.typeName) || TX_TYPES[0];
    const amount     = overrides.amount;

    const flags = {
      new_account:      overrides.forceFlags.new_account      || false,
      high_amount:      amount >= HIGH_AMOUNT_THRESHOLD,
      rapid_transfer:   overrides.forceFlags.rapid_transfer   || false,
      night_activity:   overrides.forceFlags.night_activity   || false,
      failed_attempts:  overrides.forceFlags.failed_attempts  || false,
      high_risk_zone:   overrides.forceFlags.high_risk_zone   !== undefined ? overrides.forceFlags.high_risk_zone : originZone.risk_modifier > 8,
      cross_region:     corridor.cross_region,
      round_amount:     overrides.forceFlags.round_amount     || isRoundAmount(amount),
      high_risk_type:   txType.risk_bonus > 0,
      velocity_breach:  overrides.forceFlags.velocity_breach  || false,
      behaviour_change: overrides.forceFlags.behaviour_change || false,
      repeat_fraud:     overrides.forceFlags.repeat_fraud     || false
    };

    const pts = {
      new_account:      flags.new_account      ? RISK_RULES.new_account.points      : 0,
      high_amount:      flags.high_amount      ? getAmountPoints(amount)             : 0,
      rapid_transfer:   flags.rapid_transfer   ? RISK_RULES.rapid_transfer.points   : 0,
      night_activity:   flags.night_activity   ? RISK_RULES.night_activity.points   : 0,
      failed_attempts:  flags.failed_attempts  ? RISK_RULES.failed_attempts.points  : 0,
      high_risk_zone:   flags.high_risk_zone   ? RISK_RULES.high_risk_zone.points   : 0,
      cross_region:     flags.cross_region     ? RISK_RULES.cross_region.points     : 0,
      round_amount:     flags.round_amount     ? RISK_RULES.round_amount.points     : 0,
      high_risk_type:   flags.high_risk_type   ? txType.risk_bonus                  : 0,
      velocity_breach:  flags.velocity_breach  ? RISK_RULES.velocity_breach.points  : 0,
      behaviour_change: flags.behaviour_change ? RISK_RULES.behaviour_change.points : 0,
      repeat_fraud:     flags.repeat_fraud     ? RISK_RULES.repeat_fraud.points     : 0
    };

    const cm    = getCorrelationMultiplier(flags);
    const pm    = AgentMemory.pressureMultiplier;
    const base  = Object.values(pts).reduce((s, p) => s + p, 0);
    const score = Math.min(100, Math.round(base * cm * pm));
    const dec   = getDecision(score);

    const scoreEl   = document.getElementById("inj-pscore");
    const verdictEl = document.getElementById("inj-pverdict");
    const colour    = dec === "SAFE" ? "#00d68f" : dec === "SUSPICIOUS" ? "#f5c518" : "#ff4560";

    scoreEl.textContent   = score + "/100";
    scoreEl.style.color   = colour;
    verdictEl.textContent = dec === "SAFE" ? "→ ALLOW" : dec === "SUSPICIOUS" ? "→ FLAG" : "→ BLOCK";
    verdictEl.style.color = colour;

  } catch(e) {
    // preview errors are non-fatal
  }
}

function wirePreviewListeners() {
  // Update preview whenever any input changes
  ["inj-sender","inj-amount","inj-type","inj-corridor"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", updatePreview);
  });
  document.querySelectorAll(".inj-flag-cb").forEach(cb => {
    cb.addEventListener("change", updatePreview);
  });
}

function fireInjection() {
  const overrides = getInjectionOverrides();

  if (!overrides.amount || overrides.amount < 500) {
    alert("Amount must be at least ₦500");
    return;
  }

  // Flash the button to give feedback
  const btn = document.getElementById("inj-fire-btn");
  btn.textContent = "⚡ INJECTING...";
  btn.disabled    = true;

  setTimeout(() => {
    const tx = injectTransaction(overrides);
    renderTransaction(tx);  // full UI render via ui.js

    btn.textContent = "▶  INJECT TRANSACTION";
    btn.disabled    = false;

    // Brief visual pulse on the verdict box to highlight injected result
    const vbox = document.getElementById("vbox");
    if (vbox) {
      vbox.style.outline = "2px solid #f5c518";
      setTimeout(() => { vbox.style.outline = ""; }, 800);
    }
  }, 180);   // tiny delay so the button flash is visible
}


// ------------------------------------------------------------
//  STYLES  —  injected into <head> so no extra CSS file needed
// ------------------------------------------------------------

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    /* ── Panel container ── */
    .inj-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
    }

    /* ── Toggle pill ── */
    .inj-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #0d1f35;
      border: 1px solid #f5c518;
      color: #f5c518;
      padding: 7px 14px;
      cursor: pointer;
      border-radius: 4px;
      font-family: inherit;
      font-size: 11px;
      letter-spacing: 1px;
      transition: background 0.15s;
      float: right;
    }
    .inj-toggle:hover { background: #1a2e45; }
    .inj-toggle-icon  { font-size: 14px; }

    /* ── Panel body ── */
    .inj-body {
      flex-direction: column;
      gap: 8px;
      background: #080f1a;
      border: 1px solid #1c3050;
      border-radius: 6px;
      padding: 14px;
      width: 310px;
      margin-bottom: 8px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.7);
    }

    .inj-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .inj-title {
      color: #f5c518;
      font-size: 11px;
      letter-spacing: 1.5px;
      font-weight: bold;
    }
    .inj-close {
      background: none;
      border: none;
      color: #4d6a8a;
      cursor: pointer;
      font-size: 13px;
      padding: 0;
      line-height: 1;
    }
    .inj-close:hover { color: #fff; }

    /* ── Section labels ── */
    .inj-section-label {
      color: #4d6a8a;
      font-size: 9px;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .inj-divider {
      border: none;
      border-top: 1px solid #1c3050;
      margin: 4px 0;
    }

    /* ── Preset buttons ── */
    .inj-presets {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .inj-preset {
      background: transparent;
      border: 1px solid;
      border-radius: 3px;
      padding: 4px 8px;
      font-family: inherit;
      font-size: 9px;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .inj-preset:hover { background: rgba(255,255,255,0.05); }

    /* ── Form rows ── */
    .inj-row {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-bottom: 4px;
    }
    .inj-label {
      color: #4d9ef7;
      font-size: 9px;
      letter-spacing: 1px;
    }
    .inj-select,
    .inj-input {
      background: #0d1f35;
      border: 1px solid #1c3050;
      color: #cfe8ff;
      padding: 5px 7px;
      font-family: inherit;
      font-size: 10px;
      border-radius: 3px;
      width: 100%;
      box-sizing: border-box;
    }
    .inj-select:focus,
    .inj-input:focus {
      outline: none;
      border-color: #4d9ef7;
    }

    /* ── Flag checkboxes ── */
    .inj-flags {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 10px;
    }
    .inj-flag-label {
      display: flex;
      align-items: center;
      gap: 5px;
      color: #8ab0cc;
      font-size: 9px;
      cursor: pointer;
    }
    .inj-flag-cb {
      accent-color: #f5c518;
      width: 12px;
      height: 12px;
      cursor: pointer;
    }

    /* ── Live preview ── */
    .inj-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #0d1f35;
      border: 1px solid #1c3050;
      border-radius: 3px;
      padding: 7px 10px;
    }
    .inj-preview-label {
      color: #4d6a8a;
      font-size: 9px;
      letter-spacing: 1px;
      flex: 1;
    }
    .inj-preview-score {
      font-size: 15px;
      font-weight: bold;
      color: #cfe8ff;
    }
    .inj-preview-verdict {
      font-size: 10px;
      letter-spacing: 1px;
      color: #cfe8ff;
      min-width: 70px;
      text-align: right;
    }

    /* ── Fire button ── */
    .inj-fire {
      background: #0d1f35;
      border: 1px solid #f5c518;
      color: #f5c518;
      padding: 9px;
      font-family: inherit;
      font-size: 11px;
      letter-spacing: 1.5px;
      cursor: pointer;
      border-radius: 3px;
      width: 100%;
      transition: background 0.15s;
    }
    .inj-fire:hover    { background: #1a2e45; }
    .inj-fire:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── Footnote ── */
    .inj-note {
      color: #4d6a8a;
      font-size: 8.5px;
      line-height: 1.5;
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}


// ------------------------------------------------------------
//  AUTO-MOUNT on load
// ------------------------------------------------------------

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountInjectionPanel);
} else {
  mountInjectionPanel();
}
