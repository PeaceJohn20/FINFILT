// ============================================================
//  engine.js  —  ADAPTIVE RISK AGENT  (v4 — Balanced)
//
//  This is not a calculator. This is an agent.
//
//  The agent maintains memory across transactions:
//    - Sender profiles (history, behaviour baseline)
//    - Velocity tracking (how fast a sender is transacting)
//    - Fraud pressure monitor (is fraud spiking system-wide?)
//    - Adaptive thresholds (tighten scoring when under attack)
//    - Reason codes (3-tier explanation: customer / ops / compliance)
//
//  TARGET DISTRIBUTION:  ~75% SAFE · ~17% SUSPICIOUS · ~8% FRAUD
//
//  KEY FIX (v4):
//    - Tiered amount scoring: ₦500k=18pts, ₦1M=30pts, ₦2M+=45pts
//    - Crypto Swap risk_bonus: 14 → 22 (₦3.5M crypto = real red flag)
//    - Correlation multiplier: re-tuned for new score ranges
//    - Score floor: cross_region 6→8, round_amount 5→7
//
//  SECTIONS:
//    1.  Transaction Data       — senders, zones, corridors, tx types
//    2.  Risk Rules             — point weights per signal
//    3.  Agent Memory           — profiles, velocity, pressure
//    4.  Helper Utilities       — formatting, random, decisions
//    5.  Correlation Multiplier — signal stacking dampener
//    6.  Reason Codes           — 3-tier adverse action notifications
//    7.  Transaction Generator  — assembles and scores each tx
//
//  To change scoring rules, edit ONLY this file.
// ============================================================


// ------------------------------------------------------------
//  1. TRANSACTION DATA  —  Nigerian-first, regional corridors
// ------------------------------------------------------------

const SENDERS = [
  "Chukwuemeka Obi",   "Fatima Aliyu",      "Babatunde Adeyemi",
  "Ngozi Eze",         "Musa Danjuma",       "Amaka Okonkwo",
  "Ibrahim Sule",      "Chidinma Nwosu",     "Yusuf Garba",
  "Adaeze Okeke",      "Emeka Uchenna",      "Hauwa Usman",
  "Oluwaseun Afolabi", "Kelechi Nnamdi",     "Zainab Bello"
];

const ZONES = [
  { name: "Lagos Island",  region: "South-West",    risk_modifier: 4  },
  { name: "Abuja FCT",     region: "North-Central", risk_modifier: 0  },
  { name: "Port Harcourt", region: "South-South",   risk_modifier: 5  },
  { name: "Kano",          region: "North-West",    risk_modifier: 6  },
  { name: "Ibadan",        region: "South-West",    risk_modifier: 2  },
  { name: "Onitsha",       region: "South-East",    risk_modifier: 7  },
  { name: "Aba",           region: "South-East",    risk_modifier: 8  },
  { name: "Kaduna",        region: "North-West",    risk_modifier: 5  },
  { name: "Benin City",    region: "South-South",   risk_modifier: 4  },
  { name: "Enugu",         region: "South-East",    risk_modifier: 3  },
  { name: "Maiduguri",     region: "North-East",    risk_modifier: 14 },
  { name: "Jos",           region: "North-Central", risk_modifier: 6  },
  { name: "Warri",         region: "South-South",   risk_modifier: 6  },
  { name: "Sokoto",        region: "North-West",    risk_modifier: 9  },
  { name: "Uyo",           region: "South-South",   risk_modifier: 3  }
];

const CORRIDORS = [
  { from: "Lagos Island",   to: "Kano",          cross_region: true  },
  { from: "Abuja FCT",      to: "Port Harcourt", cross_region: true  },
  { from: "Onitsha",        to: "Lagos Island",  cross_region: true  },
  { from: "Kano",           to: "Maiduguri",     cross_region: false },
  { from: "Port Harcourt",  to: "Abuja FCT",     cross_region: true  },
  { from: "Aba",            to: "Lagos Island",  cross_region: true  },
  { from: "Kaduna",         to: "Abuja FCT",     cross_region: false },
  { from: "Ibadan",         to: "Enugu",         cross_region: true  },
  { from: "Warri",          to: "Benin City",    cross_region: false },
  { from: "Sokoto",         to: "Kano",          cross_region: false },
  { from: "Maiduguri",      to: "Abuja FCT",     cross_region: true  },
  { from: "Jos",            to: "Lagos Island",  cross_region: true  },
  { from: "Uyo",            to: "Port Harcourt", cross_region: false },
  { from: "Benin City",     to: "Lagos Island",  cross_region: true  },
  { from: "Enugu",          to: "Onitsha",       cross_region: false }
];

const TX_TYPES = [
  { name: "USSD Transfer",    risk_bonus: 0  },
  { name: "Bank Transfer",    risk_bonus: 0  },
  { name: "POS Payment",      risk_bonus: 0  },
  { name: "Mobile Money",     risk_bonus: 0  },
  { name: "Airtime Recharge", risk_bonus: 8  },
  { name: "Crypto Swap",      risk_bonus: 22 },   // high — common in Nigerian fraud
  { name: "NEFT Payment",     risk_bonus: 0  },
  { name: "Agent Banking",    risk_bonus: 6  },
  { name: "Wallet Top-up",    risk_bonus: 0  }
];


// ------------------------------------------------------------
//  2. RISK RULES  —  recalibrated for realistic fraud rates
//
//  Design principle:
//    A single flag should NEVER cross a threshold alone.
//    Only stacked genuine signals should reach FRAUD.
//    Cross-region + Night + NewAccount = suspicious, not fraud.
//    Fraud requires: (high amount OR velocity) + 2–3 other signals.
// ------------------------------------------------------------

const RISK_RULES = {
  new_account:      { points: 18, label: "New Account"      },
  // high_amount uses tiered scoring below — see getAmountPoints()
  // points here is the BASE (₦500k–₦999k tier); higher amounts score more
  high_amount:      { points: 18, label: "High Amount"      },
  rapid_transfer:   { points: 12, label: "Rapid Transfer"   },
  night_activity:   { points:  8, label: "Night Activity"   },
  failed_attempts:  { points: 22, label: "Failed Attempts"  },
  high_risk_zone:   { points: 10, label: "High-Risk Zone"   },
  cross_region:     { points:  8, label: "Cross-Region"     },
  round_amount:     { points:  7, label: "Round Amount"     },
  high_risk_type:   { points:  0, label: "High-Risk Type"   },
  velocity_breach:  { points: 22, label: "Velocity Breach"  },
  behaviour_change: { points: 16, label: "Behaviour Change" },
  repeat_fraud:     { points: 28, label: "Repeat Offender"  }
};

// ------------------------------------------------------------
//  TIERED AMOUNT SCORING
//
//  ₦500k is not the same risk as ₦4M.
//  Flat scoring treated them identically — that was wrong.
//
//  Tiers (aligned to CBN large-value reporting thresholds):
//    ₦500k  – ₦999k   →  18 pts  (elevated, needs one more signal)
//    ₦1M    – ₦1.99M  →  30 pts  (high — suspicious on its own)
//    ₦2M    – ₦4.99M  →  45 pts  (very high — fraud with any co-signal)
//    ₦5M+   →           60 pts  (critical — near-automatic block)
// ------------------------------------------------------------
function getAmountPoints(amount) {
  if (amount >= 5000000) return 60;
  if (amount >= 2000000) return 45;
  if (amount >= 1000000) return 30;
  if (amount >= 500000)  return 18;
  return 0;
}

const THRESHOLDS = {
  SAFE:       { min: 0,  max: 30 },
  SUSPICIOUS: { min: 31, max: 70 },
  FRAUD:      { min: 71, max: 100 }
};

const HIGH_AMOUNT_THRESHOLD = 500000;   // ₦500,000 (~$313 at ₦1,600/$)
const USD_RATE = 1600;

const AMOUNT_RANGES = {
  normal: { min: 500,    max: 200000 },   // typical everyday tx
  medium: { min: 200001, max: 499999 },   // mid-tier, not alarming
  high:   { min: 500000, max: 5000000 }   // genuinely large
};

const ROUND_NUMBER_DIVISORS = [1000000, 500000, 100000];

// Velocity: more than 4 tx from same sender in 30 seconds is suspicious
const VELOCITY_WINDOW_MS = 120000;
const VELOCITY_TX_LIMIT  = 4;


// ------------------------------------------------------------
//  3. AGENT MEMORY
//
//  The agent never forgets a sender it has seen before.
//  Profiles accumulate across the entire session.
//  Pressure tracks system-wide fraud rate in a rolling window.
// ------------------------------------------------------------

const AgentMemory = {

  profiles:           {},
  recentDecisions:    [],
  DECISION_WINDOW:    30,    // wider window = more stable pressure reading
  pressureMultiplier: 1.0,
  totalProcessed:     0,

  getProfile(sender) {
    if (!this.profiles[sender]) {
      this.profiles[sender] = {
        txCount:      0,
        totalAmount:  0,
        avgAmount:    0,
        lastSeen:     null,
        txTimestamps: [],
        fraudCount:   0,
        flaggedCount: 0,
        zones:        [],
        types:        []
      };
    }
    return this.profiles[sender];
  },

  updateProfile(sender, tx) {
    const p   = this.getProfile(sender);
    const now = Date.now();

    p.txCount++;
    p.totalAmount += tx.amount;
    p.avgAmount    = p.totalAmount / p.txCount;
    p.lastSeen     = now;

    p.txTimestamps.push(now);
    p.txTimestamps = p.txTimestamps.filter(t => now - t <= VELOCITY_WINDOW_MS);

    if (!p.zones.includes(tx.corridor.from)) p.zones.push(tx.corridor.from);
    if (!p.types.includes(tx.type))          p.types.push(tx.type);

    if (tx.decision === "FRAUD")                                  p.fraudCount++;
    if (tx.decision === "FRAUD" || tx.decision === "SUSPICIOUS")  p.flaggedCount++;
  },

  checkVelocity(sender) {
    const p      = this.getProfile(sender);
    const now    = Date.now();
    const recent = p.txTimestamps.filter(t => now - t <= VELOCITY_WINDOW_MS);
    return recent.length > VELOCITY_TX_LIMIT;
  },

  checkBehaviourChange(sender, amount) {
    const p = this.getProfile(sender);
    // Need at least 5 tx to establish a reliable baseline
    // Flag only if current tx is 5× the sender's historical average
    if (p.txCount < 5) return false;
    return amount > p.avgAmount * 5;
  },

  checkRepeatFraud(sender) {
    const p = this.getProfile(sender);
    // Only flag after 3 confirmed fraud decisions — avoids false-positive cascade
    return p.fraudCount >= 3;
  },

  updatePressure(decision) {
    this.recentDecisions.push(decision);
    if (this.recentDecisions.length > this.DECISION_WINDOW) {
      this.recentDecisions.shift();
    }

    const fraudCount = this.recentDecisions.filter(d => d === "FRAUD").length;
    const fraudRate  = fraudCount / this.recentDecisions.length;

    // Pressure only activates under a genuine fraud spike (>40% in window)
    // Maximum multiplier capped at ×1.10 to prevent feedback runaway
    if      (fraudRate >= 0.60) this.pressureMultiplier = 1.10;
    else if (fraudRate >= 0.50) this.pressureMultiplier = 1.06;
    else if (fraudRate >= 0.40) this.pressureMultiplier = 1.03;
    else                        this.pressureMultiplier = 1.0;

    this.totalProcessed++;
  },

  getState() {
    const fraudCount = this.recentDecisions.filter(d => d === "FRAUD").length;
    const fraudRate  = this.recentDecisions.length > 0
      ? Math.round((fraudCount / this.recentDecisions.length) * 100)
      : 0;

    let alertLevel = "NORMAL";
    if      (this.pressureMultiplier >= 1.08) alertLevel = "ELEVATED";
    else if (this.pressureMultiplier >= 1.03) alertLevel = "MILD";

    return {
      totalProcessed:     this.totalProcessed,
      profilesLearned:    Object.keys(this.profiles).length,
      fraudRate,
      pressureMultiplier: this.pressureMultiplier,
      alertLevel
    };
  }
};


// ------------------------------------------------------------
//  4. HELPER UTILITIES
// ------------------------------------------------------------

function randomPick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatAmount(amount) {
  const naira   = "₦" + amount.toLocaleString("en-NG");
  const dollars = "$" + (amount / USD_RATE).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return naira + " / " + dollars;
}

function isRoundAmount(amount) {
  return ROUND_NUMBER_DIVISORS.some(d => amount % d === 0);
}

function getDecision(score) {
  if (score <= THRESHOLDS.SAFE.max)       return "SAFE";
  if (score <= THRESHOLDS.SUSPICIOUS.max) return "SUSPICIOUS";
  return "FRAUD";
}

function getColour(score) {
  const d = getDecision(score);
  if (d === "SAFE")       return "var(--safe)";
  if (d === "SUSPICIOUS") return "var(--warn)";
  return "var(--fraud)";
}

// Generate a unique reference ID for each transaction
function generateTxRef() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return "TXN-" + ts + "-" + rand;
}


// ------------------------------------------------------------
//  5. CORRELATION MULTIPLIER  —  dampened to prevent pile-ons
//
//  Flags are already summed in points. The multiplier only
//  accounts for the extra risk that correlated signals carry
//  together — it must NOT re-count what points already scored.
// ------------------------------------------------------------

function getCorrelationMultiplier(flags) {
  const activeCount = Object.values(flags).filter(Boolean).length;
  // With tiered amount scoring pushing large-tx scores up naturally,
  // keep multiplier modest — must not double-count what points express.
  if (activeCount >= 6) return 1.10;
  if (activeCount >= 4) return 1.06;
  if (activeCount >= 3) return 1.03;
  return 1.0;
}


// ------------------------------------------------------------
//  6. REASON CODES  —  3-tier adverse action notification
//
//  Every blocked or flagged transaction produces three layers:
//
//  TIER 1 — customer:    plain English, 2 reasons max, no accusation
//  TIER 2 — operations:  more detail for the review team
//  TIER 3 — compliance:  full audit record with codes + weights
//
//  Legal basis:
//    - CBN Consumer Protection Framework (2022)
//    - PCI-DSS v4 Requirement 10 (audit trails)
//    - GDPR Article 22 (automated decision-making, if EU cards used)
//
//  Rule: NEVER show repeat_fraud (R09) to the customer.
//        NEVER use the word "fraud" in customer-facing text.
// ------------------------------------------------------------

const REASON_MAP = {
  new_account: {
    code:       "R01",
    label:      "New Account Activity",
    customer:   "This account has limited transaction history",
    ops:        "Sender profile is new — insufficient baseline established",
    compliance: "New account flag: sender has < 5 transactions on record"
  },
  high_amount: {
    code:       "R02",
    label:      "High Value Transaction",
    customer:   "Transfer amount exceeds your usual activity",
    ops:        "Amount exceeds ₦500,000 threshold — tiered scoring applied (₦500k=18, ₦1M=30, ₦2M=45, ₦5M+=60)",
    compliance: "High-value transaction flag: tiered points by amount band (CBN large-value thresholds)"
  },
  rapid_transfer: {
    code:       "R03",
    label:      "Rapid Transfer Pattern",
    customer:   "Multiple transfers were initiated in a short period",
    ops:        "Transfer cadence is faster than typical for this sender",
    compliance: "Rapid transfer flag: inter-transfer interval below threshold"
  },
  night_activity: {
    code:       "R04",
    label:      "Off-Hours Activity",
    customer:   "This transfer was initiated at an unusual time",
    ops:        "Transaction occurred outside normal activity window (10pm–5am)",
    compliance: "Night activity flag: transaction timestamp in off-hours window"
  },
  failed_attempts: {
    code:       "R05",
    label:      "Prior Authentication Failures",
    customer:   "Recent failed attempts were detected on this account",
    ops:        "Sender had prior failed auth attempts before this transaction",
    compliance: "Failed attempts flag: pre-transaction auth failures recorded"
  },
  high_risk_zone: {
    code:       "R06",
    label:      "High-Risk Origin Zone",
    customer:   "Additional verification is required for transfers from this location",
    ops:        "Origin zone carries elevated risk modifier (Maiduguri / Sokoto / Aba tier)",
    compliance: "High-risk zone flag: origin zone risk_modifier > 8"
  },
  cross_region: {
    code:       "R07",
    label:      "Cross-Regional Transfer",
    customer:   "This transfer crosses regional boundaries",
    ops:        "Sender and recipient are in different geopolitical zones",
    compliance: "Cross-region flag: origin and destination zones differ"
  },
  round_amount: {
    code:       "R08",
    label:      "Round-Figure Amount",
    customer:   "The transfer amount is an exact round figure",
    ops:        "Round-number amounts (₦100k / ₦500k / ₦1M) are a structuring signal",
    compliance: "Round amount flag: amount divisible by 100,000 or greater"
  },
  high_risk_type: {
    code:       "R09",
    label:      "High-Risk Transaction Type",
    customer:   "This transaction type requires additional verification",
    ops:        "Transaction type (Crypto Swap / Agent Banking) carries elevated risk",
    compliance: "High-risk type flag: tx_type.risk_bonus > 0"
  },
  velocity_breach: {
    code:       "R10",
    label:      "Velocity Limit Exceeded",
    customer:   "Too many transfers have been initiated in a short window",
    ops:        "Sender exceeded velocity limit: > 4 transactions in 30 seconds",
    compliance: "Velocity breach flag: tx count > VELOCITY_TX_LIMIT within VELOCITY_WINDOW_MS"
  },
  behaviour_change: {
    code:       "R11",
    label:      "Behavioural Anomaly",
    customer:   "This transfer is significantly different from your usual pattern",
    ops:        "Amount is > 5× sender's historical average — behaviour deviation detected",
    compliance: "Behaviour change flag: amount > avgAmount * 5 (min 5 tx baseline)"
  },
  repeat_fraud: {
    code:       "R12",
    label:      "Repeat Risk Profile",
    customer:   null,   // NEVER shown to customer — internal only
    ops:        "Sender has 3 or more prior fraud decisions on record",
    compliance: "Repeat fraud flag: sender.fraudCount >= 3"
  }
};

// ------------------------------------------------------------
//  buildReasonCodes(tx)
//
//  Call this after a transaction is scored.
//  Returns a structured object used by:
//    - The alert feed (ui.js  →  buildAlertMessage)
//    - Any downstream notification system (SMS, push, email)
//    - The compliance audit log
//
//  tx.reasons is attached to every transaction automatically
//  by generateTransaction() — you never need to call this manually.
// ------------------------------------------------------------

function buildReasonCodes(tx) {

  // Collect every flag that fired and has a reason map entry
  const fired = Object.entries(tx.flags)
    .filter(([key, val]) => val && REASON_MAP[key])
    .map(([key]) => ({
      flag:       key,
      code:       REASON_MAP[key].code,
      label:      REASON_MAP[key].label,
      customer:   REASON_MAP[key].customer,   // null for R12
      ops:        REASON_MAP[key].ops,
      compliance: REASON_MAP[key].compliance,
      points:     tx.points[key] || 0
    }))
    .sort((a, b) => b.points - a.points);    // heaviest signal first

  // TIER 1 — customer message
  // Max 2 reasons. Never show repeat_fraud (R12). Never say "fraud".
  const customerReasons = fired
    .filter(r => r.customer !== null)
    .slice(0, 2)
    .map(r => r.customer);

  // Human-readable customer notification text
  let customerMessage = "";
  if (tx.decision === "SAFE") {
    customerMessage = "Your transfer has been processed successfully.";
  } else if (tx.decision === "SUSPICIOUS") {
    customerMessage =
      "Your transfer of " + tx.amountLabel + " is currently under review. " +
      (customerReasons.length
        ? "Reason: " + customerReasons.join("; ") + ". "
        : "") +
      "You may be contacted for verification. Reference: " + tx.ref;
  } else {
    // FRAUD — blocked, but language is non-accusatory
    customerMessage =
      "Your transfer of " + tx.amountLabel + " could not be completed at this time. " +
      (customerReasons.length
        ? "This may be related to: " + customerReasons.join("; ") + ". "
        : "") +
      "Please contact support or visit a branch. Reference: " + tx.ref;
  }

  // TIER 2 — operations / review team
  const opsReasons = fired.map(r => "[" + r.code + "] " + r.ops);

  // TIER 3 — full compliance audit record
  const complianceRecord = {
    ref:                    tx.ref,
    decision:               tx.decision,
    score:                  tx.totalScore,
    correlationMultiplier:  tx.correlationMultiplier,
    pressureMultiplier:     tx.pressureMultiplier,
    timestamp:              new Date().toISOString(),
    sender:                 tx.sender,
    amount_ngn:             tx.amount,
    corridor:               tx.corridor.from + " → " + tx.corridor.to,
    cross_region:           tx.corridor.cross_region,
    tx_type:                tx.type,
    reason_codes:           fired.map(r => ({
      code:       r.code,
      label:      r.label,
      points:     r.points,
      detail:     r.compliance
    })),
    action_taken:
      tx.decision === "SAFE"       ? "PASS — transaction settled"        :
      tx.decision === "SUSPICIOUS" ? "FLAG — queued for manual review"   :
                                     "BLOCK — transaction rejected, incident logged",
    reviewable_by: "compliance@fintech.ng"
  };

  return {
    fired,             // raw list of all triggered reason objects
    customerMessage,   // single string to show the end user
    opsReasons,        // array of strings for the ops/review team
    complianceRecord   // full audit object for the log
  };
}


// ------------------------------------------------------------
//  7. TRANSACTION GENERATOR
//
//  Produces one fully-scored, fully-annotated transaction.
//  Every field the UI, the alert feed, and the audit log need
//  is present on the returned object.
// ------------------------------------------------------------

function generateTransaction() {

  const corridor   = randomPick(CORRIDORS);
  const originZone = ZONES.find(z => z.name === corridor.from) || ZONES[0];
  const txType     = randomPick(TX_TYPES);
  const sender     = randomPick(SENDERS);

  // Scale zone risk: max modifier is 14 (Maiduguri), divide by 70 for gentle scaling
  const zoneRiskFactor   = originZone.risk_modifier / 70;
  const crossRegionBoost = corridor.cross_region ? 0.03 : 0;

  // Most transactions are everyday-sized; high-value are genuinely rare
  const highAmountRoll = Math.random();
  const isHighAmount   = highAmountRoll < (0.08 + zoneRiskFactor * 0.06);
  const isMediumAmount = !isHighAmount  && highAmountRoll < (0.08 + 0.20);

  const amount = isHighAmount
    ? randomInt(AMOUNT_RANGES.high.min,   AMOUNT_RANGES.high.max)
    : isMediumAmount
    ? randomInt(AMOUNT_RANGES.medium.min, AMOUNT_RANGES.medium.max)
    : randomInt(AMOUNT_RANGES.normal.min, AMOUNT_RANGES.normal.max);

  // Agent memory checks — these fire based on learned history
  const velocityBreach  = AgentMemory.checkVelocity(sender);
  const behaviourChange = AgentMemory.checkBehaviourChange(sender, amount);
  const repeatFraud     = AgentMemory.checkRepeatFraud(sender);

  const flags = {
    new_account:      Math.random() < (0.06 + zoneRiskFactor * 0.06),
    high_amount:      amount >= HIGH_AMOUNT_THRESHOLD,
    rapid_transfer:   Math.random() < (0.08 + zoneRiskFactor * 0.06 + crossRegionBoost),
    night_activity:   Math.random() < (0.07 + zoneRiskFactor * 0.04),
    failed_attempts:  Math.random() < (0.05 + zoneRiskFactor * 0.04),
    high_risk_zone:   originZone.risk_modifier > 8,
    cross_region:     corridor.cross_region,
    round_amount:     isRoundAmount(amount),
    high_risk_type:   txType.risk_bonus > 0,
    velocity_breach:  velocityBreach,
    behaviour_change: behaviourChange,
    repeat_fraud:     repeatFraud
  };

  const points = {
    new_account:      flags.new_account      ? RISK_RULES.new_account.points      : 0,
    high_amount:      flags.high_amount      ? getAmountPoints(amount)             : 0,  // TIERED
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
  const baseScore             = Object.values(points).reduce((sum, p) => sum + p, 0);
  const totalScore            = Math.min(100, Math.round(baseScore * correlationMultiplier * pressureMultiplier));
  const decision              = getDecision(totalScore);

  const tx = {
    ref:         generateTxRef(),      // unique reference for every transaction
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
    colour:     getColour(totalScore),
    reasons:    null,    // populated below after ref is assigned
    agentState: null     // populated below after memory update
  };

  // Build reason codes now that tx has a ref and decision
  tx.reasons = buildReasonCodes(tx);

  // Agent learns from this transaction
  AgentMemory.updateProfile(sender, tx);
  AgentMemory.updatePressure(decision);

  tx.agentState = AgentMemory.getState();

  return tx;
}
