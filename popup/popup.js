/**
 * ConnectFlow - Apple-Style Popup Controller
 * Real-time State Machine Sync, Automatic Sends, Live Countdown & Fresh Counter Reset
 */

(function () {
  'use strict';

  const Constants = window.ConnectFlowConstants;
  if (!Constants) return;

  const { MAX_REQUESTS, STATES, MESSAGE_TYPES } = Constants;

  const DOM = {
    statusPill: document.getElementById('status-pill'),
    statusDot: document.getElementById('status-dot'),
    statusLabel: document.getElementById('status-label'),

    sentCount: document.getElementById('sent-count'),
    maxCount: document.getElementById('max-count'),
    remainingCount: document.getElementById('remaining-count'),
    progressBar: document.getElementById('progress-bar'),

    statSent: document.getElementById('stat-sent'),
    statSkipped: document.getElementById('stat-skipped'),
    statErrors: document.getElementById('stat-errors'),

    profileCard: document.getElementById('profile-card'),
    profileBadgeState: document.getElementById('profile-badge-state'),
    profileInitials: document.getElementById('profile-initials'),
    profileName: document.getElementById('profile-name'),
    profileHeadline: document.getElementById('profile-headline'),
    profileMutuals: document.getElementById('profile-mutuals'),
    profileMutualsText: document.getElementById('profile-mutuals-text'),

    countdownBanner: document.getElementById('countdown-banner'),
    countdownNum: document.getElementById('countdown-num'),

    activityList: document.getElementById('activity-list'),
    activityEmpty: document.getElementById('activity-empty'),
    btnClearActivity: document.getElementById('btn-clear-activity'),

    btnStart: document.getElementById('btn-start'),
    activeControlsRow: document.getElementById('active-controls-row'),
    btnPause: document.getElementById('btn-pause'),
    btnStop: document.getElementById('btn-stop'),

    limitOverlay: document.getElementById('limit-overlay'),
    btnNewSession: document.getElementById('btn-new-session'),

    // Diagnostics
    btnToggleDiagnostics: document.getElementById('btn-toggle-diagnostics'),
    diagnosticsToggleLabel: document.getElementById('diagnostics-toggle-label'),
    diagnosticsContent: document.getElementById('diagnostics-content'),
    diagCardsDetected: document.getElementById('diag-cards-detected'),
    diagButtonsFound: document.getElementById('diag-buttons-found'),
    diagWithMutuals: document.getElementById('diag-with-mutuals'),
    diagWithoutMutuals: document.getElementById('diag-without-mutuals'),
    diagProcessedCount: document.getElementById('diag-processed-count'),
    diagState: document.getElementById('diag-state'),
    diagOpId: document.getElementById('diag-op-id')
  };

  let currentState = {
    status: STATES.IDLE,
    statusDetail: 'Ready to start.',
    sentCount: 0,
    skippedCount: 0,
    errorCount: 0,
    maxRequests: MAX_REQUESTS,
    currentProfile: null,
    countdownSeconds: 0,
    activityFeed: [],
    diagnostics: {
      profileCardsDetected: 0,
      connectButtonsDetected: 0,
      profilesWithMutuals: 0,
      profilesWithoutMutuals: 0,
      alreadyProcessed: 0
    },
    sessionRunId: null
  };

  let isDiagnosticsOpen = false;

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

    DOM.btnToggleDiagnostics.addEventListener('click', toggleDiagnostics);
  }

  function toggleDiagnostics() {
    isDiagnosticsOpen = !isDiagnosticsOpen;
    DOM.diagnosticsContent.classList.toggle('hidden', !isDiagnosticsOpen);
    DOM.diagnosticsToggleLabel.textContent = isDiagnosticsOpen ? 'Hide' : 'Show';
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
    try {
      // Starts fresh session resetting counter to 0
      const resp = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.START_SESSION });
      if (resp && resp.error === 'NO_LINKEDIN_TAB') {
        DOM.profileHeadline.textContent = 'Please open a LinkedIn tab first to start.';
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
      await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.START_SESSION });
    } catch (err) {
      console.warn('[ConnectFlow] Reset message failed:', err);
    }
  }

  function getInitials(name) {
    if (!name || name === 'LinkedIn Member' || name === 'No Profile Active') return 'CF';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function render() {
    renderStatus();
    renderRequests();
    renderStats();
    renderProfile();
    renderActivity();
    renderControls();
    renderLimit();
    renderDiagnostics();
  }

  function renderStatus() {
    const status = currentState.status;

    DOM.statusDot.className = 'status-dot';

    switch (status) {
      case STATES.SCANNING:
        DOM.statusDot.classList.add('scanning');
        DOM.statusLabel.textContent = 'AUTO SCANNING';
        break;
      case STATES.PROCESSING:
        DOM.statusDot.classList.add('scanning');
        DOM.statusLabel.textContent = 'AUTO CONNECTING';
        break;
      case STATES.VERIFYING:
        DOM.statusDot.classList.add('scanning');
        DOM.statusLabel.textContent = 'VERIFYING';
        break;
      case STATES.DELAYING:
        DOM.statusDot.classList.add('scanning');
        DOM.statusLabel.textContent = `5s COOLDOWN (${currentState.countdownSeconds || 5}s)`;
        break;
      case STATES.PAUSED:
        DOM.statusDot.classList.add('paused');
        DOM.statusLabel.textContent = 'PAUSED';
        break;
      case STATES.LIMIT_REACHED:
        DOM.statusDot.classList.add('stopped');
        DOM.statusLabel.textContent = '100 COMPLETE';
        break;
      case STATES.STOPPED:
        DOM.statusDot.classList.add('stopped');
        DOM.statusLabel.textContent = 'STOPPED';
        break;
      case STATES.ERROR:
        DOM.statusDot.classList.add('stopped');
        DOM.statusLabel.textContent = 'ERROR';
        break;
      case STATES.IDLE:
      default:
        DOM.statusDot.classList.add('stopped');
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
      status === STATES.PROCESSING ||
      status === STATES.VERIFYING
    )) {
      DOM.profileName.textContent = profile.name || 'LinkedIn Member';
      DOM.profileHeadline.textContent = profile.headline || 'Professional on LinkedIn';
      DOM.profileInitials.textContent = getInitials(profile.name);

      const mutuals = profile.mutualConnections || 1;
      DOM.profileMutualsText.textContent = `${mutuals} mutual connection${mutuals > 1 ? 's' : ''}`;
      DOM.profileBadgeState.textContent = 'AUTO CONNECTING';
      DOM.profileBadgeState.className = 'profile-badge-state qualified';
      DOM.countdownBanner.classList.add('hidden');
    } else {
      if (status === STATES.DELAYING) {
        DOM.profileName.textContent = 'Auto-Send Cooldown';
        DOM.profileHeadline.textContent = '5-second safety delay between automated dispatches.';
        DOM.profileInitials.textContent = '5s';
        DOM.profileBadgeState.textContent = 'COOLDOWN';
        DOM.profileBadgeState.className = 'profile-badge-state';
        DOM.profileMutualsText.textContent = 'Next profile in queue';

        DOM.countdownBanner.classList.remove('hidden');
        DOM.countdownNum.textContent = currentState.countdownSeconds || 5;
      } else if (status === STATES.SCANNING) {
        DOM.profileName.textContent = 'Auto-Scanning LinkedIn...';
        DOM.profileHeadline.textContent = 'Finding profiles with ≥1 mutual connection.';
        DOM.profileInitials.textContent = '🔍';
        DOM.profileBadgeState.textContent = 'SCANNING';
        DOM.profileBadgeState.className = 'profile-badge-state';
        DOM.profileMutualsText.textContent = 'Filter: ≥ 1 Mutual Connection';
        DOM.countdownBanner.classList.add('hidden');
      } else if (status === STATES.LIMIT_REACHED) {
        DOM.profileName.textContent = 'Session Complete';
        DOM.profileHeadline.textContent = '100 connection requests successfully processed.';
        DOM.profileInitials.textContent = '100';
        DOM.profileBadgeState.textContent = 'FINISHED';
        DOM.profileBadgeState.className = 'profile-badge-state';
        DOM.countdownBanner.classList.add('hidden');
      } else if (status === STATES.PAUSED) {
        DOM.profileName.textContent = 'Session Paused';
        DOM.profileHeadline.textContent = 'Click Resume to continue automated dispatch loop.';
        DOM.profileInitials.textContent = 'II';
        DOM.profileBadgeState.textContent = 'PAUSED';
        DOM.profileBadgeState.className = 'profile-badge-state';
        DOM.countdownBanner.classList.add('hidden');
      } else {
        DOM.profileName.textContent = 'No Profile Active';
        DOM.profileHeadline.textContent = 'Start automated session on LinkedIn to begin.';
        DOM.profileInitials.textContent = 'CF';
        DOM.profileBadgeState.textContent = 'IDLE';
        DOM.profileBadgeState.className = 'profile-badge-state';
        DOM.profileMutualsText.textContent = 'Mutual filter active (≥1)';
        DOM.countdownBanner.classList.add('hidden');
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

    feed.slice(0, 40).forEach(item => {
      const row = document.createElement('div');
      row.className = 'act-row';

      const time = document.createElement('span');
      time.className = 'act-time';
      time.textContent = item.time || '--:--:--';

      const msg = document.createElement('span');
      msg.className = 'act-msg';
      msg.textContent = item.message || '';

      row.appendChild(time);
      row.appendChild(msg);
      DOM.activityList.appendChild(row);
    });
  }

  function renderDiagnostics() {
    const diag = currentState.diagnostics || {};
    if (DOM.diagCardsDetected) DOM.diagCardsDetected.textContent = diag.profileCardsDetected || 0;
    if (DOM.diagButtonsFound) DOM.diagButtonsFound.textContent = diag.connectButtonsDetected || 0;
    if (DOM.diagWithMutuals) DOM.diagWithMutuals.textContent = diag.profilesWithMutuals || 0;
    if (DOM.diagWithoutMutuals) DOM.diagWithoutMutuals.textContent = diag.profilesWithoutMutuals || 0;
    if (DOM.diagProcessedCount) DOM.diagProcessedCount.textContent = diag.alreadyProcessed || 0;
    if (DOM.diagState) DOM.diagState.textContent = currentState.status || 'IDLE';
    if (DOM.diagOpId) DOM.diagOpId.textContent = currentState.sessionRunId ? currentState.sessionRunId.slice(-8) : '--';
  }

  function renderControls() {
    const status = currentState.status;

    const isActive = (
      status === STATES.SCANNING ||
      status === STATES.PROCESSING ||
      status === STATES.VERIFYING ||
      status === STATES.DELAYING
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
