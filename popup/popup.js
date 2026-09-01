/**
 * ConnectFlow - Minimalist Popup Controller
 * Real-Time Dynamic State Subscription & Controls
 */

(function () {
  'use strict';

  const Constants = window.ConnectFlowConstants;
  if (!Constants) return;

  const { MAX_REQUESTS, STATES, MESSAGE_TYPES } = Constants;

  const DOM = {
    statusDot: document.getElementById('status-dot'),
    statusLabel: document.getElementById('status-label'),

    sentCount: document.getElementById('sent-count'),
    maxCount: document.getElementById('max-count'),
    remainingCount: document.getElementById('remaining-count'),
    progressBar: document.getElementById('progress-bar'),

    statSent: document.getElementById('stat-sent'),
    statSkipped: document.getElementById('stat-skipped'),
    statErrors: document.getElementById('stat-errors'),

    profileName: document.getElementById('profile-name'),
    profileHeadline: document.getElementById('profile-headline'),
    profileStatus: document.getElementById('profile-status'),

    activityList: document.getElementById('activity-list'),
    activityEmpty: document.getElementById('activity-empty'),
    btnClearActivity: document.getElementById('btn-clear-activity'),

    btnStart: document.getElementById('btn-start'),
    activeControlsRow: document.getElementById('active-controls-row'),
    btnPause: document.getElementById('btn-pause'),
    btnStop: document.getElementById('btn-stop'),

    limitOverlay: document.getElementById('limit-overlay'),
    btnNewSession: document.getElementById('btn-new-session')
  };

  let currentState = {
    status: STATES.IDLE,
    statusDetail: 'Ready to start.',
    sentCount: 0,
    skippedCount: 0,
    errorCount: 0,
    maxRequests: MAX_REQUESTS,
    currentProfile: null,
    activityFeed: []
  };

  async function init() {
    bindEvents();
    await fetchState();
    setupStorageListener();
  }

  function bindEvents() {
    DOM.btnStart.addEventListener('click', handleStart);
    DOM.btnPause.addEventListener('click', handlePauseResume);
    DOM.btnStop.addEventListener('click', handleStop);

    DOM.btnClearActivity.addEventListener('click', handleClearActivity);
    DOM.btnNewSession.addEventListener('click', handleResetSession);
  }

  async function fetchState() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_SESSION_STATE
      });
      if (response && response.success && response.state) {
        currentState = response.state;
        render();
      }
    } catch (e) {
      chrome.storage.local.get(['cf_session_state'], data => {
        if (data.cf_session_state) {
          currentState = data.cf_session_state;
          render();
        }
      });
    }
  }

  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.cf_session_state) {
        currentState = changes.cf_session_state.newValue || currentState;
        render();
      }
    });
  }

  async function handleStart() {
    if (currentState.sentCount >= MAX_REQUESTS) {
      DOM.limitOverlay.classList.remove('hidden');
      return;
    }

    try {
      const resp = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.START_SESSION });
      if (resp && resp.error === 'NO_LINKEDIN_TAB') {
        DOM.profileStatus.textContent = 'STATUS: OPEN LINKEDIN TAB FIRST';
      }
    } catch (err) {
      console.warn('[ConnectFlow] Start message failed:', err);
    }
  }

  async function handlePauseResume() {
    try {
      if (currentState.status === STATES.PAUSED) {
        await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.RESUME_SESSION });
      } else {
        await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.PAUSE_SESSION });
      }
    } catch (err) {
      console.warn('[ConnectFlow] Pause/Resume message failed:', err);
    }
  }

  async function handleStop() {
    try {
      await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.STOP_SESSION });
    } catch (err) {
      console.warn('[ConnectFlow] Stop message failed:', err);
    }
  }

  async function handleClearActivity() {
    currentState.activityFeed = [];
    await chrome.storage.local.set({ cf_session_state: currentState });
    renderActivity();
  }

  async function handleResetSession() {
    DOM.limitOverlay.classList.add('hidden');
    try {
      await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.RESET_SESSION });
    } catch (err) {
      console.warn('[ConnectFlow] Reset message failed:', err);
    }
  }

  function render() {
    renderStatus();
    renderRequests();
    renderStats();
    renderProfile();
    renderActivity();
    renderControls();
    renderLimit();
  }

  function renderStatus() {
    const status = currentState.status;

    DOM.statusDot.classList.toggle('paused', status === STATES.PAUSED);

    switch (status) {
      case STATES.SCANNING:
        DOM.statusLabel.textContent = 'SCANNING';
        break;
      case STATES.PROFILE_FOUND:
        DOM.statusLabel.textContent = 'PROFILE FOUND';
        break;
      case STATES.PROCESSING:
        DOM.statusLabel.textContent = 'PROCESSING';
        break;
      case STATES.VERIFYING:
        DOM.statusLabel.textContent = 'VERIFYING';
        break;
      case STATES.WAITING_DELAY:
        DOM.statusLabel.textContent = 'WAITING (5s)';
        break;
      case STATES.PAUSED:
        DOM.statusLabel.textContent = 'PAUSED';
        break;
      case STATES.LIMIT_REACHED:
        DOM.statusLabel.textContent = 'COMPLETE (100)';
        break;
      case STATES.STOPPED:
        DOM.statusLabel.textContent = 'STOPPED';
        break;
      case STATES.TIMEOUT:
        DOM.statusLabel.textContent = 'TIMEOUT';
        break;
      case STATES.ERROR:
        DOM.statusLabel.textContent = 'ERROR';
        break;
      case STATES.SKIPPED:
        DOM.statusLabel.textContent = 'SKIPPED';
        break;
      case STATES.IDLE:
      default:
        DOM.statusLabel.textContent = 'READY';
        break;
    }
  }

  function renderRequests() {
    const sent = Math.min(currentState.sentCount || 0, MAX_REQUESTS);
    const max = MAX_REQUESTS;
    const remaining = Math.max(0, max - sent);
    const percent = Math.round((sent / max) * 100);

    DOM.sentCount.textContent = sent;
    DOM.maxCount.textContent = max;
    DOM.remainingCount.textContent = remaining;
    DOM.progressBar.style.width = `${percent}%`;
  }

  function renderStats() {
    DOM.statSent.textContent = currentState.sentCount || 0;
    DOM.statSkipped.textContent = currentState.skippedCount || 0;
    DOM.statErrors.textContent = currentState.errorCount || 0;
  }

  function renderProfile() {
    const profile = currentState.currentProfile;
    const status = currentState.status;

    if (profile && (
      status === STATES.PROFILE_FOUND ||
      status === STATES.PROCESSING ||
      status === STATES.VERIFYING ||
      status === STATES.WAITING_DELAY ||
      status === STATES.PAUSED
    )) {
      DOM.profileName.textContent = profile.name || 'LinkedIn Member';
      DOM.profileHeadline.textContent = profile.headline || 'Professional';

      if (status === STATES.PROCESSING) {
        DOM.profileStatus.textContent = 'STATUS: CONNECTING...';
      } else if (status === STATES.VERIFYING) {
        DOM.profileStatus.textContent = 'STATUS: VERIFYING INVITATION...';
      } else if (status === STATES.WAITING_DELAY) {
        DOM.profileStatus.textContent = 'STATUS: VERIFIED — NEXT IN 5s';
      } else if (status === STATES.PAUSED) {
        DOM.profileStatus.textContent = 'STATUS: PAUSED';
      } else {
        DOM.profileStatus.textContent = 'STATUS: PROFILE DETECTED';
      }
    } else {
      if (status === STATES.SCANNING) {
        DOM.profileName.textContent = 'Scanning LinkedIn...';
        DOM.profileHeadline.textContent = 'Looking for next eligible connect button.';
        DOM.profileStatus.textContent = 'STATUS: SCANNING';
      } else if (status === STATES.WAITING_DELAY) {
        DOM.profileName.textContent = 'Cycle Cooldown';
        DOM.profileHeadline.textContent = '5s safety delay between connection requests.';
        DOM.profileStatus.textContent = 'STATUS: NEXT REQUEST IN 5s';
      } else if (status === STATES.TIMEOUT) {
        DOM.profileName.textContent = 'Recovering from Timeout';
        DOM.profileHeadline.textContent = 'Previous action timed out and was skipped.';
        DOM.profileStatus.textContent = 'STATUS: TIMEOUT RECOVERED';
      } else if (status === STATES.LIMIT_REACHED) {
        DOM.profileName.textContent = 'Session Complete';
        DOM.profileHeadline.textContent = '100 connection requests successfully processed.';
        DOM.profileStatus.textContent = 'STATUS: 100 / 100 COMPLETE';
      } else if (status === STATES.PAUSED) {
        DOM.profileName.textContent = 'Session Paused';
        DOM.profileHeadline.textContent = 'Click Resume to continue automated loop.';
        DOM.profileStatus.textContent = 'STATUS: PAUSED';
      } else {
        DOM.profileName.textContent = 'No Profile Active';
        DOM.profileHeadline.textContent = 'Start session on LinkedIn to begin automated loop.';
        DOM.profileStatus.textContent = 'STATUS: IDLE';
      }
    }
  }

  function renderActivity() {
    const feed = currentState.activityFeed || [];

    if (feed.length === 0) {
      DOM.activityList.innerHTML = '';
      DOM.activityList.appendChild(DOM.activityEmpty);
      return;
    }

    DOM.activityList.innerHTML = '';

    feed.slice(0, 30).forEach(item => {
      const row = document.createElement('div');
      row.className = 'activity-item';

      const time = document.createElement('span');
      time.className = 'activity-time';
      time.textContent = item.time || '--:--:--';

      const msg = document.createElement('span');
      msg.className = 'activity-msg';
      msg.textContent = item.message || '';

      row.appendChild(time);
      row.appendChild(msg);
      DOM.activityList.appendChild(row);
    });
  }

  function renderControls() {
    const status = currentState.status;

    const isActive = (
      status === STATES.SCANNING ||
      status === STATES.PROFILE_FOUND ||
      status === STATES.PROCESSING ||
      status === STATES.VERIFYING ||
      status === STATES.WAITING_DELAY ||
      status === STATES.TIMEOUT
    );

    if (isActive) {
      DOM.btnStart.classList.add('hidden');
      DOM.activeControlsRow.classList.remove('hidden');
      DOM.btnPause.textContent = 'PAUSE';
    } else if (status === STATES.PAUSED) {
      DOM.btnStart.classList.add('hidden');
      DOM.activeControlsRow.classList.remove('hidden');
      DOM.btnPause.textContent = 'RESUME';
    } else {
      DOM.btnStart.classList.remove('hidden');
      DOM.activeControlsRow.classList.add('hidden');
      DOM.btnStart.disabled = (status === STATES.LIMIT_REACHED);
    }
  }

  function renderLimit() {
    if (currentState.status === STATES.LIMIT_REACHED || currentState.sentCount >= MAX_REQUESTS) {
      DOM.limitOverlay.classList.remove('hidden');
    } else {
      DOM.limitOverlay.classList.add('hidden');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
