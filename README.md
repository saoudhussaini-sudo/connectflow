# ⚡ ConnectFlow — LinkedIn Connection Assistant

> **Minimalist, High-Performance Chrome Extension (Manifest V3)**
> Designed in the clean monochrome utility aesthetic (Linear / Raycast / Apple Utility) with an automated 10-second connection dispatch loop, global watchdog protection, and a strict 100-request safety ceiling.

[![Live Web Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-black?style=for-the-badge&logo=github)](https://saoudhussaini-sudo.github.io/connectflow/)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-white?style=for-the-badge&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)

---

## 🌐 Live Web Demo

Experience the interactive ConnectFlow simulator directly in your browser:  
👉 **[https://saoudhussaini-sudo.github.io/connectflow/](https://saoudhussaini-sudo.github.io/connectflow/)**

---

## 🖤 Design System & Visual Identity

* **Monochrome Utility**: Pure black background (`#000000`), crisp white text (`#ffffff`), muted secondary labels (`#666666`), thin 1px dividers (`#1a1a1a`), and solid white/black buttons.
* **No Clutter**: Zero gradients, neon accents, purple/blue glows, or decorative animations.
* **Streamlined Visual Hierarchy**:
  * `CONNECTFLOW` title & status indicator (`READY`, `SCANNING`, `PROCESSING`, `VERIFYING`, `WAITING (10s)`, `PAUSED`, `STOPPED`, `COMPLETE`).
  * `REQUESTS`: Prominent session counter `37 / 100` and `63 remaining` with a 3px monochrome progress bar.
  * `SENT`, `SKIPPED`, `ERRORS` three-column statistics separated by thin lines.
  * `CURRENT PROFILE`: Minimal profile details with real-time phase updates.
  * `ACTIVITY LOG`: Compact timeline with timestamps (`HH:MM:SS`).
  * `[ START AUTOMATED LOOP (10s) ]`, `[ PAUSE ]`, `[ STOP ]` controls.

---

## ⚡ Automated 10-Second Continuous Loop

The discovery and connection workflow runs automatically in a continuous 10-second sequence:

```
[ START AUTOMATED LOOP (10s) ]
            ↓
  Auto-detect next eligible profile
            ↓
  Highlight & scroll into view
            ↓
  Send connection request automatically
            ↓
  Auto-dismiss "Send without note" modal
            ↓
  Verify invitation dispatched
            ↓
  Increment counter (e.g. 37 → 38 / 100)
            ↓
  Wait 10 seconds (10,000ms delay)
            ↓
  Auto-scan & send next profile
            ↓
  Repeat until 100 / 100 → Auto Stop
```

---

## 🛡️ Watchdog & Anti-Hang Protection

* **Step Timeouts**: Every asynchronous operation has guaranteed bounded execution (`CLICK`: 5s, `MODAL`: 4s, `VERIFY`: 6s, `GLOBAL WATCHDOG`: 25s).
* **Self-Healing Recovery**: If LinkedIn DOM changes or verification fails, the operation automatically aborts, logs to activity feed, increments errors, and recovers without freezing.
* **Zero Count on Failure**: Timeouts and failed attempts **never increment `sentCount`**.
* **Deduplication**: Maintains a session-level `Set` of profile handles and URNs to prevent duplicate processing.
* **Race Condition Shielding**: Unique `sessionRunId` and `operationId` tokens ensure stale callbacks never corrupt state.

---

## 📁 Project Architecture

```
connectflow/
├── manifest.json              # Chrome MV3 manifest
├── shared/
│   ├── constants.js           # Action types, states, timeouts, MAX_REQUESTS = 100
│   └── session-state.js       # Atomic state manager & chrome.storage sync
├── background/
│   └── service-worker.js      # Minimalist message router & badge updater
├── content/
│   ├── linkedin-detector.js   # Resilient DOM scanner & deduplication key extractor
│   ├── linkedin.js            # Watchdog-protected orchestrator with 10s loop
│   └── content.css            # Crisp monochrome target outline & badge
├── popup/
│   ├── popup.html             # Clean monochrome dashboard layout
│   ├── popup.css              # Apple / Linear style black & white styling
│   └── popup.js               # State subscriber, real-time UI rendering & controls
├── assets/
│   └── icons/                 # 16, 32, 48, 128 px monochrome icons
├── index.html                 # GitHub Pages interactive web showcase
├── generate-icons.js          # Procedural PNG icon generator
├── test-integrity.js          # Automated verification test suite
└── README.md
```

---

## 🚀 Installation & Testing

### 1. Clone & Load in Chrome
```bash
git clone https://github.com/saoudhussaini-sudo/connectflow.git
```
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Turn **ON** Developer Mode in the top-right corner.
3. Click **Load unpacked** and select the `connectflow/` folder.

### 2. Run on LinkedIn
1. Open [LinkedIn People Search](https://www.linkedin.com/search/results/people/) or [My Network](https://www.linkedin.com/mynetwork/).
2. Click the **ConnectFlow** icon in the toolbar.
3. Click **START AUTOMATED LOOP (10s)**.
4. Watch ConnectFlow automatically detect profiles, dispatch invitations, and progress up to the 100 limit.
5. Click **STOP** or **PAUSE** anytime for instant control.

---

## 🧪 Running Automated Tests

Run the built-in test suite:
```bash
node test-integrity.js
```
