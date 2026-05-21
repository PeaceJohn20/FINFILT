// ============================================================
//  controls.js  —  CONTROLS  (buttons, timer, speed)
//
//  This file is the glue between the engine and the UI.
//  It runs the main loop and handles all user interactions.
//
//  Depends on: engine.js + ui.js  (must be loaded before this)
// ============================================================


// ------------------------------------------------------------
//  1. AGENT STATE
// ------------------------------------------------------------

let isPaused = false;      // is the simulation currently paused?
let intervalMs = 2000;     // how often a new transaction fires (milliseconds)
let timerHandle = null;    // reference to the setInterval so we can stop/restart it


// ------------------------------------------------------------
//  2. MAIN LOOP  —  runs once every intervalMs milliseconds
// ------------------------------------------------------------

function tick() {
  if (isPaused) return;           // do nothing while paused

  const tx = generateTransaction();   // engine.js  — create a transaction
  renderTransaction(tx);              // ui.js       — draw it on screen
}


// ------------------------------------------------------------
//  3. CONTROLS OBJECT  —  called by onclick= in index.html
// ------------------------------------------------------------

const Controls = {

  // ── PAUSE / RESUME ──────────────────────────────────────
  toggle() {
    isPaused = !isPaused;

    const btn   = document.getElementById("tog-btn");
    const label = document.getElementById("tog-label");
    const icon  = btn.querySelector("i");
    const pill  = document.getElementById("status-pill");
    const dot   = document.getElementById("live-dot");

    if (isPaused) {
      // Switch button to RESUME style
      btn.className      = "cbtn resume-btn";
      icon.className     = "ti ti-player-play";
      label.textContent  = "RESUME";

      // Update status indicators
      pill.textContent   = "PAUSED";
      pill.className     = "pill paused";
      dot.style.background = "var(--warn)";
    } else {
      // Switch button back to PAUSE style
      btn.className      = "cbtn pause-btn";
      icon.className     = "ti ti-player-pause";
      label.textContent  = "PAUSE";

      // Update status indicators
      pill.textContent   = "AGENT ONLINE";
      pill.className     = "pill online";
      dot.style.background = "var(--safe)";
    }
  },

  // ── CLEAR ────────────────────────────────────────────────
  clear() {
    clearScreen();   // ui.js — wipes feeds and resets counters
  },

  // ── SET SPEED ────────────────────────────────────────────
  // Called by the SLOW / NORMAL / FAST buttons
  setSpeed(ms, clickedButton) {
    intervalMs = ms;

    // Highlight only the clicked speed button
    document.querySelectorAll(".spd-btn").forEach(b => b.classList.remove("active"));
    clickedButton.classList.add("active");

    // Restart the timer at the new interval
    clearInterval(timerHandle);
    timerHandle = setInterval(tick, intervalMs);
  }

};


// ------------------------------------------------------------
//  4. START  —  fire one transaction immediately, then start loop
// ------------------------------------------------------------

tick();                                         // show first transaction right away
timerHandle = setInterval(tick, intervalMs);    // then repeat every intervalMs
