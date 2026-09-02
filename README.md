# ⚡ ConnectFlow — Automated LinkedIn Assistant (Apple Style)

> **High-Performance Chrome Extension (Manifest V3)**
> Features an intelligent **Mutual Connection Filter (≥ 1 required)**, **Fully Automated 5-Second Dispatch Loop (No Permission Prompts)**, **Fresh 0/100 Counter Resets**, **Global Watchdog Protection**, and an **Apple Product Design System**.

[![Live Web Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-black?style=for-the-badge&logo=github)](https://saoudhussaini-sudo.github.io/connectflow/)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-white?style=for-the-badge&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)

---

## 🌐 Live Web Demo

Experience the interactive Apple-style ConnectFlow simulator directly in your browser:  
👉 **[https://saoudhussaini-sudo.github.io/connectflow/](https://saoudhussaini-sudo.github.io/connectflow/)**

---

## ⚡ Automated Workflow & Zero-Reset

1. **Every New Session Starts From Zero (0/100)**:  
   Whenever a new session starts or is reset, the session counter is cleared back to **`0 / 100`**.

2. **Automated Dispatch (No User Permission Required)**:  
   ConnectFlow automatically identifies qualified candidates with **≥ 1 mutual connection**, clicks Connect, dismisses the note dialog, verifies the dispatched request, and advances the session counter.

3. **Exact 5-Second Cooldown**:  
   Runs an exact 5,000ms countdown between dispatches with instant cancellation on `STOP` or `PAUSE`.

```
[ START AUTOMATED LOOP (5s) ] (Counter resets to 0/100)
            ↓
  Auto-detect profile cards on LinkedIn
            ↓
  Inspect mutual connections (≥ 1 required)
            ↓
  If 0 mutuals / Follow-only / Pending:
    → Skip candidate & log reason
            ↓
  If qualified (≥ 1 mutual connection):
    1. Highlight profile card & scroll into view
    2. Auto-click Connect button
    3. Auto-handle "Send without a note" modal
    4. Verify status changed to "Pending"
    5. Increment counter (e.g. 0 → 1 / 100, 2 / 100...)
    6. Run exact 5-second countdown cooldown (5s... 4s... 3s... 2s... 1s...)
    7. Auto-scan & process next qualified profile
            ↓
  Repeat until reaching 100/100 limit → Auto Halt
```

---

## 🍎 Apple Product Design System

* **Dark Mode Titanium Aesthetic**: Translucent frosted glass layers (`rgba(22, 26, 36, 0.75)` with `backdrop-filter: blur(20px)`), 1px border glows, and tactile Apple buttons.
* **Current Profile Card**: Monogram initials avatar, candidate name, headline, green mutual badge (`● 4 mutual connections`), and live status pill (`● AUTO CONNECTING`).
* **Visual Metric Cards**: Prominent `0 / 100` session counter with progress bar, `MUTUAL FILTER: ≥ 1`, and `COOLDOWN: 5s`.
* **5-Second Countdown Cooldown**: Clean live countdown banner with progress spinner between dispatches.
* **Detailed Activity Timeline**: Real-time timestamps (`HH:MM:SS`) recording qualification decisions and dispatches.
* **Diagnostic Panel**: Live metrics showing profile cards detected, connect buttons found, profiles with/without mutuals, and active session ID.

---

## 📁 Project Architecture

```
connectflow/
├── manifest.json              # Chrome MV3 manifest
├── shared/
│   ├── constants.js           # Action types, states, MIN_MUTUAL_CONNECTIONS = 1, MAX_REQUESTS = 100
│   └── session-state.js       # Atomic state manager & countdown controller
├── background/
│   └── service-worker.js      # Message router & badge updater
├── content/
│   ├── linkedin-detector.js   # Robust DOM scanner, mutuals extractor & button classifier
│   ├── linkedin.js            # Automated loop orchestrator, auto-send & 5s cooldown
│   └── content.css            # Apple-style spotlight target outline & qualified badge
├── popup/
│   ├── popup.html             # Apple product style dashboard layout
│   ├── popup.css              # Obsidian & titanium frosted glass styling
│   └── popup.js               # State subscriber, live countdown & controls
├── assets/
│   └── icons/                 # 16, 32, 48, 128 px icons
├── index.html                 # GitHub Pages interactive web showcase
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
1. Open [LinkedIn My Network](https://www.linkedin.com/mynetwork/) or [People Search](https://www.linkedin.com/search/results/people/).
2. Click the **ConnectFlow** icon in the toolbar.
3. Click **START AUTOMATED LOOP (5s)**.
4. The counter resets to `0 / 100` and ConnectFlow automatically finds candidates with **≥ 1 mutual connection**, dispatches connection requests, waits 5 seconds, and repeats until the 100 limit is reached.

---

## 🧪 Automated Test Suite

Run the built-in test suite:
```bash
node test-integrity.js
```
