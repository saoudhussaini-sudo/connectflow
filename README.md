# ⚡ ConnectFlow — LinkedIn Connection Assistant (Apple / Product Style)

> **High-Performance Chrome Extension (Manifest V3)**
> Features an intelligent **Mutual Connection Filter (≥ 1 required)**, **User-Confirmed Dispatch Action**, **Exact 5-Second Cooldown**, **Global Watchdog Protection**, and an **Apple Product Design System**.

[![Live Web Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-black?style=for-the-badge&logo=github)](https://saoudhussaini-sudo.github.io/connectflow/)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-white?style=for-the-badge&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)

---

## 🌐 Live Web Demo

Experience the interactive Apple-style ConnectFlow simulator directly in your browser:  
👉 **[https://saoudhussaini-sudo.github.io/connectflow/](https://saoudhussaini-sudo.github.io/connectflow/)**

---

## 🛡️ Qualification Pipeline (≥ 1 Mutual Connection)

A profile is eligible **ONLY** when:
1. A genuine **Connect** action is available (not *Follow*, *Pending*, or *Message*).
2. The candidate has **at least 1 mutual connection** with the user (e.g. *"4 mutual connections"*, *"1 mutual connection"*).

```
SCAN PAGE
   ↓
DETECT PROFILE CARD
   ↓
CHECK BUTTON STATE (Connect vs Follow / Pending / Message)
   ↓
CHECK MUTUAL CONNECTIONS (getMutualConnectionCount)
   ↓
IF mutualConnections >= 1
   → QUALIFIED (PROFILE READY)
   → Highlight card & Present candidate in popup
   → User clicks [ SEND REQUEST ]
   → Verified sent → sentCount++
   → Exact 5-Second Cooldown (5... 4... 3... 2... 1...)
   → Scan next qualified profile
ELSE (0 mutuals or unknown)
   → SKIP (Log: "Rahul Sharma skipped — 0 mutual connections")
   → Automatically evaluate next candidate
```

---

## 🍎 Apple Product Design System

* **Dark Mode Titanium Aesthetic**: Translucent frosted glass layers (`rgba(22, 26, 36, 0.75)` with `backdrop-filter: blur(20px)`), 1px border glows, and tactile Apple buttons.
* **Live Confirmation Card**: Monogram initials avatar, candidate name, occupation headline, and green pill badge (`● 4 mutual connections`).
* **Visual Metric Cards**: Prominent `37 / 100` session counter with progress bar, `MUTUAL FILTER: ≥ 1`, and `EXACT DELAY: 5s`.
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
│   ├── linkedin.js            # Qualification orchestrator, user-confirmed dispatch & 5s cooldown
│   └── content.css            # Apple-style spotlight target outline & qualified badge
├── popup/
│   ├── popup.html             # Apple product style dashboard layout
│   ├── popup.css              # Obsidian & titanium frosted glass styling
│   └── popup.js               # State subscriber, live countdown & confirmation handler
├── assets/
│   └── icons/                 # 16, 32, 48, 128 px icons
├── index.html                 # GitHub Pages interactive web showcase
├── test-integrity.js          # 10-case automated qualification & state test suite
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
3. Click **START QUALIFIED SCAN**.
4. ConnectFlow will automatically find the first candidate with **≥ 1 mutual connection** and present them in the popup.
5. Click **SEND REQUEST** (or **SKIP**).
6. After verified dispatch, ConnectFlow enters an exact **5-second countdown cooldown** before finding the next qualified candidate.

---

## 🧪 Automated Test Suite

Run the built-in 10-case qualification test suite:
```bash
node test-integrity.js
```
