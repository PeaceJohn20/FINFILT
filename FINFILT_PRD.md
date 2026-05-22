# FINFILT — Autonomous Fraud Detection Engine
### Project Requirements Document

| Field | Value |
|---|---|
| **Product** | FinFilt |
| **Document Type** | Project Requirements Document (PRD) |
| **Version** | 1.0 |
| **Status** | Draft — For Review |
| **Domain** | Nigerian Fintech · Fraud Detection |
| **Classification** | Confidential · Internal Use Only |
| **Author** | Peace John |
| **Event** | AI Unleashed Hackathon |

---

## 1. Executive Summary

FinFilt is a client-side, real-time autonomous fraud detection engine purpose-built for the Nigerian fintech ecosystem. It operates entirely in the browser without requiring a server, ML library, or external API. The engine combines deterministic rule-based scoring with an adaptive agent memory layer to produce per-transaction risk scores, three-tier reason codes, and autonomous block/flag/allow decisions.

---

## 2. Project Context

### 2.1 Background

Fraud losses across Nigerian payment infrastructure continue to rise, with the Nigerian Inter-Bank Settlement System (NIBSS) reporting multi-billion naira losses annually. Most available fraud tools are either cost-prohibitive for early-stage fintechs or are rule-only calculators with no adaptive capability. FinFilt addresses this gap by delivering a production-grade detection engine that any fintech can deploy at zero infrastructure cost.

### 2.2 Problem Statement

- Existing open-source fraud tools lack Nigerian corridor awareness and local risk profiles.
- Rules-only engines cannot adapt to fraud waves or evolving sender behaviour.
- Most agent-based approaches require ML backends inaccessible to small fintechs.
- There is no free, browser-deployable, operator-level fraud dashboard for the Nigerian market.

### 2.3 Proposed Solution

FinFilt delivers a four-component system: a risk scoring engine with 12 signals, an agent memory layer that builds per-sender profiles, a real-time decision pipeline, and a monitoring UI — all running in a single HTML file with no dependencies beyond CDN-hosted fonts and icons.

### 2.4 Scope

| | |
|---|---|
| **In Scope** | Risk engine, agent memory, decision logic, reason code generation, UI dashboard, simulation loop, manual injection |
| **Out of Scope** | Live payment API integration, persistent storage, user authentication, mobile app, ML model training |
| **Deferred (v2+)** | XGBoost scoring layer, analyst feedback loop, Paystack/Flutterwave webhook connector |

---

## 3. Stakeholders

| Role | Name / Team | Responsibility |
|---|---|---|
| Product Owner | Peace John | Requirements, roadmap, demo delivery |
| Engine Developer | Jessica Dominic and Faith Somtochuku | engine.js — risk logic, agent memory, reason codes |
| UI Developer | Angel Thomas | ui.js, style.css — dashboard rendering |
| QA / Test | TBD | Score accuracy, decision threshold verification |
| Compliance Advisor | TBD | Reason code audit trail review |
| Future: Ops Analyst | TBD | Manual review queue consumer |

---

## 4. Functional Requirements

### 4.1 Transaction Generation (Simulation)

The engine must generate synthetic transactions representative of real Nigerian payment flows for demonstration and testing. Each transaction must include:

- Unique transaction reference (TX-XXXXXXXX format)
- Sender name drawn from a Nigerian name pool (minimum 30 names)
- Transaction type selected from: Bank Transfer, Mobile Money, POS Payment, USSD Transfer, Crypto Swap, Agent Banking, International Wire
- Amount in Nigerian Naira (₦), with dual display in USD using a configurable exchange rate
- Origin/destination city pair drawn from the Nigerian corridor table (minimum 15 city pairs)
- Cross-region flag automatically derived from origin/destination regions
- Account age flag (new account probability configurable)
- Night activity flag (23:00 – 05:00 local time window)
- Failed attempts flag (prior failed transaction history simulation)

### 4.2 Risk Scoring Engine

The engine must compute a composite risk score (0–100) for every transaction using a two-layer model.

#### 4.2.1 Rules-Based Signals

| Signal | Max Points | Trigger Condition |
|---|---|---|
| New Account | +25 | Account flagged as recently opened |
| High Amount (T1) | +18 | Amount ≥ ₦500,000 |
| High Amount (T2) | +30 | Amount ≥ ₦1,000,000 |
| High Amount (T3) | +45 | Amount ≥ ₦2,000,000 |
| Rapid Transfer | +20 | Multiple transfers within a short rolling window |
| Night Activity | +8 | Transaction between 23:00 and 05:00 |
| Failed Attempts | +12 | Prior failed transactions on sender account |
| High-Risk Zone | +12 | Origin city risk modifier above threshold |
| Cross-Region | +8 | Origin and destination in different regions |
| Round Amount | +7 | Amount is a suspiciously round figure |
| High-Risk Type: Agent Banking | +14 | Transaction type is Agent Banking |
| High-Risk Type: Crypto Swap | +22 | Transaction type is Crypto Swap |

#### 4.2.2 Agent-Learned Signals

| Signal | Points | Detection Logic |
|---|---|---|
| Velocity Breach | +20 | Same sender exceeds 3 transactions within a 30-second rolling window |
| Behaviour Change | +18 | Transaction amount exceeds 5× the sender's personal rolling average |
| Repeat Offender | +24 | Sender's historical fraud rate exceeds 40% of their transaction count |

#### 4.2.3 Correlation Multiplier

When two or more high-severity signals co-occur on a single transaction, the engine must apply a correlation multiplier that amplifies the total score. The multiplier must be configurable and must not allow scores to exceed 100.

#### 4.2.4 Pressure Multiplier

The agent must monitor system-wide fraud rate across the last 20 transactions. When the fraud rate exceeds 45%, the engine must apply a pressure multiplier to tighten scoring until the rate normalises. The multiplier must be logged as part of the agent state output.

### 4.3 Decision Engine

After computing the risk score, the engine must map it to one of three decisions:

| Score Range | Decision | Action |
|---|---|---|
| 0 – 30 | SAFE | ALLOW — transaction proceeds normally |
| 31 – 70 | SUSPICIOUS | FLAG — route to manual review queue |
| 71 – 100 | FRAUD | BLOCK — transaction halted, incident logged |

Target decision distribution: approximately 75% SAFE, 17% SUSPICIOUS, 8% FRAUD.

### 4.4 Agent Memory

The engine must maintain a persistent in-session `AgentMemory` object. For each unique sender, the memory must track:

- Total transaction count
- Running average transaction amount
- Fraud decision count and computed fraud rate
- Recent transaction timestamps for velocity calculation

The memory must be updated after every transaction tick and must survive pause/resume cycles. It must be cleared only on explicit user reset.

### 4.5 Reason Code Generation

For every transaction, the engine must generate a structured `reasons` object containing three tiers of messaging:

| Tier | Audience | Content Requirements |
|---|---|---|
| Customer Message | End customer | Plain-language explanation with no internal scoring details or signal names exposed |
| Ops Reasons | Operations / Review team | Technical signal list, score breakdown, pressure state, corridor risk, agent flags |
| Compliance Record | Audit / Compliance team | Full record: ref, sender, amount, score, decision, all signals, timestamp, pressure state, agent memory snapshot |

> The compliance record must be available on the transaction object but must **not** be rendered in the UI. It is reserved for downstream audit log integration.

### 4.6 Simulation Controls

- **PAUSE / RESUME** — halt and restart the transaction tick loop without resetting state
- **CLEAR** — wipe the UI feeds and reset all counters; also reset agent memory to baseline
- **SPEED** — user-selectable SLOW (3s), NORMAL (2s), FAST (1s) tick intervals
- **Manual Injection** (inject.js) — ability to fire a synthetic high-risk transaction on demand for demo purposes

---

## 5. Non-Functional Requirements

### 5.1 Performance

- Risk calculation must complete in under 10ms per transaction on a mid-range consumer device.
- UI render time must not exceed 50ms per transaction at FAST speed (1s interval).
- The simulation must sustain FAST speed (60+ tx/min) without frame drops or memory leaks.
- DOM feed lists must be capped (40 transaction rows, 25 alert cards) to bound memory growth.

### 5.2 Compatibility

- Must run in any modern browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+) with no install.
- Must function fully offline after initial CDN asset load (fonts, icons).
- No server, no build step, no package manager required at runtime.

### 5.3 Accuracy

- Score distribution must approximate target ratios (75/17/8) across a 200-transaction sample.
- Velocity breach detection must be accurate within the 30-second rolling window.
- Behaviour change detection must correctly identify deviations ≥5× sender average.

### 5.4 Maintainability

- Engine logic must be isolated in `engine.js`; UI logic in `ui.js`; controls in `controls.js`.
- No cross-file coupling other than the defined public interfaces: `generateTransaction()` and `renderTransaction()`.
- All risk point weights and thresholds must be defined in a single `RISK_RULES` configuration object.
- Exchange rate, city zones, and corridor table must each be independently configurable constants.

### 5.5 Deployability

- Must deploy to GitHub Pages in under 5 minutes from a fresh repository.
- Total unminified asset size must not exceed 150KB excluding CDN resources.

---

## 6. System Architecture

### 6.1 File Structure

| File | Purpose |
|---|---|
| `index.html` | Page structure and layout. No business logic. Loads scripts in dependency order. |
| `css/style.css` | All visual styles, colour variables, animations, and responsive layout rules. |
| `js/engine.js` | Risk agent: transaction generation, scoring, agent memory, decision logic, reason code generation. |
| `js/ui.js` | DOM renderer: chart, transaction feed, alert feed, KPIs, score display, latency bar. |
| `js/controls.js` | Simulation controller: tick loop, pause/resume, speed control, clear. |
| `js/inject.js` | Optional manual injection: fires a synthetic high-risk transaction for live demos. |

### 6.2 Data Flow

The engine follows a strict unidirectional data flow on each tick:

1. `controls.js` calls `generateTransaction()` (engine.js)
2. `engine.js` evaluates all signals, applies multipliers, selects decision, builds reasons object
3. `engine.js` returns a fully-enriched transaction object (`tx`)
4. `controls.js` passes `tx` to `renderTransaction()` (ui.js)
5. `ui.js` updates all DOM elements; no engine calls are made from ui.js
6. `engine.js` updates `AgentMemory` with the decision outcome for future scoring

### 6.3 Transaction Object Schema

| Field | Type / Description |
|---|---|
| `ref` | String — unique transaction ID (TX-XXXXXXXX) |
| `sender` | String — sender display name |
| `type` | String — transaction type label |
| `amount` | Number — amount in Naira |
| `amountLabel` | String — formatted display string (₦X,XXX / $X,XXX) |
| `corridor` | Object — `{ from, to, cross_region: bool }` |
| `totalScore` | Number — final risk score 0–100 |
| `decision` | String — `'SAFE'` \| `'SUSPICIOUS'` \| `'FRAUD'` |
| `colour` | String — hex colour code matching decision tier |
| `points` | Object — map of signal keys to individual point values |
| `reasons` | Object — `{ customerMessage, opsReasons[], complianceRecord }` |
| `agentState` | Object — `{ pressureMultiplier, alertLevel, profilesLearned }` |

---

## 7. Nigerian Market Requirements

### 7.1 City Corridors

The engine must model a minimum of 15 real Nigerian city pairs. Each zone must carry a risk modifier used to compute the High-Risk Zone signal.

| City | Region | Risk Modifier |
|---|---|---|
| Abuja (FCT) | North-Central | 0 — lowest risk |
| Lagos | South-West | 5 |
| Port Harcourt | South-South | 6 |
| Ibadan | South-West | 2 |
| Enugu | South-East | 3 |
| Uyo | South-South | 3 |
| Aba | South-East | 8 |
| Onitsha | South-East | 7 |
| Kano | North-West | 6 |
| Kaduna | North-West | 6 |
| Sokoto | North-West | 9 |
| Maiduguri | North-East | 14 — highest risk |

### 7.2 Currency

- All amounts must be stored internally in Nigerian Naira (₦).
- Dual display must show both ₦ and $ (USD) using a configurable `USD_RATE` constant.
- Default exchange rate: ₦1,300 per $1 (configurable).

### 7.3 Transaction Types

| Type | Risk Level |
|---|---|
| Bank Transfer | Standard |
| Mobile Money | Standard |
| POS Payment | Standard |
| USSD Transfer | Standard |
| International Wire | Elevated |
| Agent Banking | +14 points |
| Crypto Swap | +22 points (highest-risk type) |

---

## 8. User Interface Requirements

### 8.1 Layout

The dashboard must be a fixed three-column layout within a single browser viewport (no scrolling required on standard 1080p display):

- **Left column (200px)** — Risk Engine panel: current score, factor bars, threshold legend
- **Centre column (flex)** — Live Transaction Stream: sparkline chart, scrollable transaction feed
- **Right column (220px)** — Decision Engine panel: verdict box, agent state grid, alert feed

Above the columns: top bar, control bar, KPI strip. Below: latency bar.

### 8.2 Visual Design

- Dark theme with CSS custom properties for all colours.
- Primary background: `#07090D`. Primary text: `#DDEEFF`. Font: JetBrains Mono.
- Status colours: SAFE `#00D68F`, SUSPICIOUS `#F5C518`, FRAUD `#FF4560`, accent blue `#4D9EF7`.
- All status indicators must update within one render frame of a new transaction.
- FRAUD verdict must trigger a jolt animation on the verdict box.
- Live dot must pulse continuously while the agent is running; amber while paused.

### 8.3 KPI Strip

Must display four live counters with colour coding: PROCESSED (white), SAFE (green), SUSPICIOUS (amber), FRAUD (red). Percentage breakdowns must update in the control bar in real time.

### 8.4 Risk Chart

An HTML5 Canvas sparkline must render the last 80 risk scores. The chart must include threshold guide lines at 30 and 70. A coloured dot at the latest data point must reflect the current decision tier colour.

### 8.5 Alert Feed

Alert cards must differentiate content by decision tier:

- **SAFE** — brief customer-facing confirmation only.
- **SUSPICIOUS** — top 3 ops signals plus customer message.
- **FRAUD** — top 3 ops signals, customer message, and transaction reference.

The compliance record must never be rendered in the alert feed.

### 8.6 Latency Bar

The bottom status bar must display: risk calculation time (ms), UI render time (ms), total loop time (ms), and throughput (tx/min). Values must update on every transaction tick.

---

## 9. Acceptance Criteria

| ID | Criterion | Pass Condition |
|---|---|---|
| AC-01 | Score bounded | `totalScore` is always an integer in range [0, 100] |
| AC-02 | Decision mapping | SAFE for score ≤30; SUSPICIOUS for 31–70; FRAUD for ≥71, with no exceptions |
| AC-03 | Agent memory persistence | Velocity, average, and fraud rate update correctly across 10+ transactions from same sender |
| AC-04 | Reason code completeness | All three reason tiers present on every tx object; compliance record never empty for FRAUD |
| AC-05 | Velocity breach | 3rd transaction from same sender within 30s triggers +20 velocity breach signal |
| AC-06 | Pressure multiplier | Multiplier activates when fraud rate in last 20 tx exceeds 45% |
| AC-07 | UI performance | No visible jank at FAST (1s) speed on 1080p display for 500+ transactions |
| AC-08 | Pause fidelity | State (counts, memory, history) preserved exactly across pause/resume cycle |
| AC-09 | Clear reset | All counters, feeds, and agent memory reset to zero/baseline on CLEAR |
| AC-10 | Offline operation | Dashboard fully functional after initial page load with no network access |
| AC-11 | Score distribution | Over 200 tx: 65–85% SAFE, 12–22% SUSPICIOUS, 4–12% FRAUD |
| AC-12 | Compliance record excluded | `complianceRecord` present on `tx.reasons` but not rendered anywhere in the DOM |

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Score inflation under pressure multiplier causes 100% FRAUD rate | Medium | High | Cap total score at 100 regardless of multiplier; auto-decay pressure multiplier over time |
| Agent memory grows unbounded in long sessions | Low | Medium | Cap sender profile map to 500 entries; evict LRU profiles |
| Simulation does not represent real transaction distributions | High | Medium | Tune random weights against CBN/NIBSS fraud pattern data in v2 |
| Canvas chart causes GC pressure at FAST speed | Low | Low | Cap `riskHistory` array to 160 entries; clear old data with splice |
| CDN unavailability breaks fonts/icons | Low | Low | Bundle JetBrains Mono and Tabler Icons locally for production build |

---

## 11. Development Roadmap

| Version | Milestone | Key Deliverables |
|---|---|---|
| v1 (Current) | Hackathon MVP | Rules engine, agent memory, adaptive pressure, 12 signals, 3-tier reason codes, full dashboard UI |
| v2 | ML Scoring Layer | Replace rules scoring with XGBoost model trained on Nigerian historical transaction data |
| v3 | Analyst Feedback Loop | Review queue UI, analyst decision capture, weekly model retraining pipeline |
| v4 | Live API Integration | Paystack / Flutterwave / Moniepoint webhook connector for real transaction stream |
| v5 | Production Hardening | Auth, persistent storage, multi-analyst support, SLA monitoring, SOC 2 audit trail |

---

## 12. Glossary

| Term | Definition |
|---|---|
| **Agent Memory** | In-session data store tracking per-sender behavioural profiles (velocity, average amount, fraud rate). |
| **Behaviour Change** | Agent signal triggered when a transaction amount exceeds 5× the sender's rolling personal average. |
| **Compliance Record** | Third tier of reason codes: full audit-grade transaction record for regulatory consumption. Not surfaced in UI. |
| **Correlation Multiplier** | Score amplifier applied when two or more high-severity signals co-occur on a single transaction. |
| **Corridor** | A city-pair route (origin → destination) used to derive cross-region risk and zone risk modifiers. |
| **Customer Message** | First tier of reason codes: plain-language explanation suitable for display to the end customer. |
| **Decision Engine** | The pipeline that maps a computed risk score to a SAFE / SUSPICIOUS / FRAUD decision and downstream action. |
| **Ops Reasons** | Second tier of reason codes: technical signal list for operations and manual review teams. |
| **Pressure Multiplier** | Score amplifier activated when system-wide fraud rate across last 20 transactions exceeds 45%. |
| **Repeat Offender** | Agent signal triggered when a sender's historical fraud decision rate exceeds 40%. |
| **Risk Score** | Composite integer (0–100) summing all active signal points, multiplied by correlation and pressure factors. |
| **Velocity Breach** | Agent signal triggered when the same sender submits more than 3 transactions within a 30-second window. |
| **Zone Risk Modifier** | A city-level integer offset added to the risk score when the transaction originates from a high-risk city. |

---

*Confidential · For Internal Use Only*
