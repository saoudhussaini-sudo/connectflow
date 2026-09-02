/**
 * ConnectFlow - LinkedIn Content Script Orchestrator
 * Fully automated mutual-connection loop (≥1 mutual required), fresh session counter reset (0/100),
 * automatic click & verification, and exact 5-second cooldown without manual permission prompts.
 */

(function () {
  'use strict';

  const Constants = window.ConnectFlowConstants;
  const Detector = window.ConnectFlowLinkedInDetector;

  if (!Constants || !Detector) {
    console.error('[ConnectFlow] Dependencies missing in content context.');
    return;
  }

  const { STATES, MESSAGE_TYPES, TIMEOUTS, MAX_REQUESTS, REQUEST_DELAY_MS } = Constants;
  const DEBUG = true;

  function logDebug(tag, ...args) {
    if (DEBUG) {
      const time = new Date().toTimeString().split(' ')[0];
      console.log(`%c[ConnectFlow] [${time}] ${tag}:`, 'color: #30d158; font-weight: bold;', ...args);
    }
  }

  class LinkedInOrchestrator {
    constructor() {
      this.isRunning = false;
      this.sessionRunId = null;
      this.currentOperationId = 0;
      this.currentCandidate = null;
      this.isProcessing = false;
      this.sentCount = 0;

      // Central Resource Tracking
      this.activeTimers = new Set();
      this.activeObservers = new Set();
      this.countdownTimer = null;

      // Session Deduplication
      this.processedProfileKeys = new Set();
      this.processedElements = new WeakSet();

      this.initMessageListeners();
    }

    initMessageListeners() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const { type, payload } = message || {};

        switch (type) {
          case MESSAGE_TYPES.START_SESSION:
            // Fresh session resets counter to 0
            this.sentCount = 0;
            this.processedProfileKeys.clear();
            this.processedElements = new WeakSet();
            this.start();
            sendResponse({ success: true });
            break;

          case MESSAGE_TYPES.PAUSE_SESSION:
            this.pause();
            sendResponse({ success: true });
            break;

          case MESSAGE_TYPES.RESUME_SESSION:
            this.resume();
            sendResponse({ success: true });
            break;

          case MESSAGE_TYPES.STOP_SESSION:
            this.stop();
            sendResponse({ success: true });
            break;

          case MESSAGE_TYPES.RESET_SESSION:
            this.reset();
            sendResponse({ success: true });
            break;

          case MESSAGE_TYPES.PING:
            sendResponse({ success: true, status: 'ready', isRunning: this.isRunning });
            break;

          default:
            sendResponse({ success: false, error: 'UNKNOWN_TYPE' });
            break;
        }

        return true;
      });
    }

    setTimeoutGuarded(fn, delayMs) {
      const timerId = setTimeout(() => {
        this.activeTimers.delete(timerId);
        try {
          fn();
        } catch (e) {
          logDebug('ERROR in setTimeoutGuarded', e);
        }
      }, delayMs);
      this.activeTimers.add(timerId);
      return timerId;
    }

    cleanupCurrentOperation() {
      for (const timerId of this.activeTimers) {
        clearTimeout(timerId);
        clearInterval(timerId);
      }
      this.activeTimers.clear();

      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }

      for (const observer of this.activeObservers) {
        try {
          observer.disconnect();
        } catch (e) {}
      }
      this.activeObservers.clear();

      this.clearHighlight();
      this.currentCandidate = null;
      this.isProcessing = false;
    }

    start() {
      logDebug('START_AUTOMATED_LOOP', 'Initializing automated loop with fresh counter (0/100)...');
      this.isRunning = true;
      this.sessionRunId = 'run_' + Date.now();
      this.currentOperationId = 0;
      this.cleanupCurrentOperation();
      this.startObserver();
      this.scanAndAutoProcessNext();
    }

    pause() {
      logDebug('PAUSE_SESSION', 'Pausing automated workflow...');
      this.isRunning = false;
      this.cleanupCurrentOperation();
    }

    resume() {
      logDebug('RESUME_SESSION', 'Resuming automated workflow...');
      this.isRunning = true;
      this.cleanupCurrentOperation();
      this.startObserver();
      this.scanAndAutoProcessNext();
    }

    stop() {
      logDebug('STOP_SESSION', 'Stopping all actions...');
      this.isRunning = false;
      this.sessionRunId = null;
      this.cleanupCurrentOperation();
    }

    reset() {
      logDebug('RESET_SESSION', 'Resetting session...');
      this.stop();
      this.sentCount = 0;
      this.processedProfileKeys.clear();
      this.processedElements = new WeakSet();
    }

    startObserver() {
      if (this.observer) return;

      this.observer = new MutationObserver(() => {
        if (!this.isRunning || this.currentCandidate || this.isProcessing) return;
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      this.activeObservers.add(this.observer);
    }

    /**
     * Scans for qualified profiles and automatically dispatches request on its own
     */
    async scanAndAutoProcessNext() {
      if (!this.isRunning || this.isProcessing) return;

      const opId = ++this.currentOperationId;
      const runId = this.sessionRunId;

      logDebug('Scan started', `Cycle opId=${opId}, sentCount=${this.sentCount}/${MAX_REQUESTS}`);

      if (this.sentCount >= MAX_REQUESTS) {
        logDebug('LIMIT_REACHED', '100 requests reached. Stopping session.');
        this.stop();
        return;
      }

      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.STATE_TRANSITION,
        payload: { nextState: STATES.SCANNING, statusDetail: 'Auto-scanning for profiles with ≥1 mutual connection...' }
      });

      const candidate = this.findNextQualifiedCandidate(opId, runId);

      if (!candidate) {
        logDebug('SCAN RESULT', 'No unvisited qualified profiles in current view. Scrolling page to load more...');

        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.ACTIVITY_LOG,
          payload: { message: 'No qualified candidates visible. Scrolling page...', type: 'info' }
        });

        window.scrollBy({ top: 450, behavior: 'smooth' });

        this.setTimeoutGuarded(() => {
          if (this.isValidRun(opId, runId)) {
            const retryCandidate = this.findNextQualifiedCandidate(opId, runId);
            if (retryCandidate) {
              this.executeCandidateLifecycle(retryCandidate, opId, runId);
            } else {
              this.scheduleNextScan(2000);
            }
          }
        }, 1500);

        return;
      }

      // Automatically execute candidate lifecycle without asking for manual user permission
      await this.executeCandidateLifecycle(candidate, opId, runId);
    }

    /**
     * Discovers candidates, processes skipped profiles with logs, updates diagnostics
     */
    findNextQualifiedCandidate(opId, runId) {
      const scan = Detector.scanProfiles(document);

      logDebug('Buttons found', scan.totalButtons);
      logDebug('Connect candidates', scan.connectButtonsCount);
      logDebug('Profile cards found', scan.profileCardsCount);
      logDebug('Qualified profiles', scan.qualifiedCandidates.length);

      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_DIAGNOSTICS,
        payload: {
          diagnostics: {
            profileCardsDetected: scan.profileCardsCount,
            connectButtonsDetected: scan.connectButtonsCount,
            profilesWithMutuals: scan.profilesWithMutuals,
            profilesWithoutMutuals: scan.profilesWithoutMutuals,
            alreadyProcessed: this.processedProfileKeys.size
          }
        }
      });

      // 1. Process and record skipped profiles
      for (const skipped of scan.skippedCandidates) {
        const key = skipped.metadata.profileKey;
        const btn = skipped.element;

        if (!this.processedProfileKeys.has(key) && !this.processedElements.has(btn)) {
          this.processedProfileKeys.add(key);
          this.processedElements.add(btn);

          logDebug('Candidate Skipped', `${skipped.metadata.name} — ${skipped.skipReason}`);
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.PROFILE_DISQUALIFIED,
            payload: {
              profile: skipped.metadata,
              reason: skipped.skipReason
            }
          });
        }
      }

      // 2. Find first unvisited qualified candidate
      for (const qualified of scan.qualifiedCandidates) {
        const key = qualified.metadata.profileKey;
        const btn = qualified.element;

        if (!this.processedProfileKeys.has(key) && !this.processedElements.has(btn)) {
          logDebug('Candidate Qualified', `${qualified.metadata.name} (${qualified.metadata.mutualConnections} mutuals)`);
          return qualified;
        }
      }

      return null;
    }

    /**
     * Executes the automatic connection dispatch lifecycle
     */
    async executeCandidateLifecycle(candidate, opId, runId) {
      if (!this.isValidRun(opId, runId)) return;

      this.isProcessing = true;
      this.currentCandidate = candidate;

      const profile = candidate.metadata;
      const button = candidate.element;
      const initialText = button.textContent || '';

      this.processedProfileKeys.add(profile.profileKey);
      this.processedElements.add(button);

      logDebug('AUTO_CONNECT', `Auto-dispatching request to: ${profile.name} (${profile.mutualConnections} mutuals)`);

      // Scroll into view & highlight
      try {
        candidate.cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {
        button.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      this.highlightCandidate(candidate);

      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.REQUEST_PROCESSING,
        payload: { profile }
      });

      let isStepFinished = false;
      const watchdogTimer = this.setTimeoutGuarded(() => {
        if (!isStepFinished && this.isValidRun(opId, runId)) {
          logDebug('WATCHDOG_TRIGGERED', `Watchdog timeout on ${profile.name}`);
          isStepFinished = true;
          this.handleStepTimeout('GLOBAL_STEP_WATCHDOG', profile, opId, runId);
        }
      }, TIMEOUTS.GLOBAL_STEP_WATCHDOG);

      try {
        // Step 1: Automatically click Connect
        logDebug('CLICK_ACTION', `Clicking Connect for ${profile.name}`);
        button.click();

        // Step 2: Automatically handle "Send without a note" modal
        await this.handlePotentialModalWithTimeout(opId, runId, TIMEOUTS.MODAL_HANDLER_TIMEOUT);

        if (!this.isValidRun(opId, runId) || isStepFinished) return;

        // Step 3: Transition to Verifying
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.REQUEST_VERIFYING,
          payload: { profile }
        });

        // Step 4: Verify Status changed to Pending
        const verified = await this.verifyActionSuccessWithTimeout(button, initialText, opId, runId, TIMEOUTS.VERIFICATION_TIMEOUT);

        if (!this.isValidRun(opId, runId) || isStepFinished) return;

        isStepFinished = true;
        clearTimeout(watchdogTimer);
        this.activeTimers.delete(watchdogTimer);

        if (verified) {
          this.sentCount += 1;
          logDebug('SUCCESS', `Request verified for ${profile.name}! Total: ${this.sentCount}/${MAX_REQUESTS}`);

          this.clearHighlight();
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.REQUEST_VERIFIED,
            payload: { profile }
          });

          // Start exact 5-second countdown before automatically scanning next
          this.start5SecondCountdown(opId, runId);
        } else {
          logDebug('VERIFICATION_FAILED', `Verification timed out for ${profile.name}`);
          this.clearHighlight();
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.REQUEST_FAILED,
            payload: { error: 'Status did not change to Pending within timeout', profile }
          });
          this.isProcessing = false;
          this.currentCandidate = null;
          this.scheduleNextScan(1500);
        }
      } catch (err) {
        if (!isStepFinished && this.isValidRun(opId, runId)) {
          isStepFinished = true;
          clearTimeout(watchdogTimer);
          this.activeTimers.delete(watchdogTimer);

          logDebug('ACTION_ERROR', `Error processing ${profile.name}: ${err.message}`);
          this.clearHighlight();
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.REQUEST_FAILED,
            payload: { error: err.message || 'Execution error', profile }
          });
          this.isProcessing = false;
          this.currentCandidate = null;
          this.scheduleNextScan(1500);
        }
      }
    }

    /**
     * Exact 5-Second Countdown Cooldown between automated sends
     */
    start5SecondCountdown(opId, runId) {
      this.isProcessing = false;
      this.currentCandidate = null;

      if (this.sentCount >= MAX_REQUESTS) {
        logDebug('LIMIT_REACHED', '100 requests reached. Stopping automated session.');
        this.stop();
        return;
      }

      let remaining = 5;

      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
      }

      this.countdownTimer = setInterval(() => {
        if (!this.isRunning || this.sessionRunId !== runId) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
          return;
        }

        remaining -= 1;
        logDebug('COUNTDOWN', `Next auto-send in ${remaining}s...`);

        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.COUNTDOWN_TICK,
          payload: { seconds: remaining }
        });

        if (remaining <= 0) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
          this.scanAndAutoProcessNext();
        }
      }, 1000);
    }

    handleStepTimeout(stage, profile, opId, runId) {
      this.clearHighlight();
      this.isProcessing = false;
      this.currentCandidate = null;

      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.REQUEST_TIMEOUT,
        payload: { stage, profile }
      });

      if (this.isRunning && this.sessionRunId === runId) {
        this.scheduleNextScan(1500);
      }
    }

    scheduleNextScan(delayMs = 1500) {
      this.setTimeoutGuarded(() => {
        if (this.isRunning) {
          this.scanAndAutoProcessNext();
        }
      }, delayMs);
    }

    isValidRun(opId, runId) {
      return this.isRunning && this.sessionRunId === runId;
    }

    async handlePotentialModalWithTimeout(opId, runId, timeoutMs = TIMEOUTS.MODAL_HANDLER_TIMEOUT) {
      return new Promise(resolve => {
        let finished = false;

        const timer = this.setTimeoutGuarded(() => {
          if (!finished) {
            finished = true;
            resolve();
          }
        }, timeoutMs);

        const checkInterval = setInterval(() => {
          if (finished || !this.isValidRun(opId, runId)) {
            finished = true;
            clearInterval(checkInterval);
            clearTimeout(timer);
            resolve();
            return;
          }

          const modal = document.querySelector('.artdeco-modal, .send-invite');
          if (modal) {
            const modalButtons = Array.from(modal.querySelectorAll('button'));
            const sendBtn = modalButtons.find(btn => {
              const label = (btn.getAttribute('aria-label') || '').toLowerCase();
              const text = (btn.textContent || '').toLowerCase().trim();
              return (
                text === 'send without a note' ||
                text === 'send now' ||
                text === 'send' ||
                label.includes('send without a note') ||
                label.includes('send now')
              );
            });

            if (sendBtn && !sendBtn.disabled) {
              finished = true;
              clearInterval(checkInterval);
              clearTimeout(timer);
              sendBtn.click();
              this.setTimeoutGuarded(resolve, 250);
              return;
            }

            const modalText = (modal.textContent || '').toLowerCase();
            if (modalText.includes("you've reached the weekly invitation limit") || modalText.includes('invitation limit')) {
              finished = true;
              clearInterval(checkInterval);
              clearTimeout(timer);
              const dismissBtn = modal.querySelector('button[aria-label="Dismiss"], button[aria-label="Close"]');
              if (dismissBtn) dismissBtn.click();
              resolve();
              return;
            }
          }
        }, 120);
      });
    }

    async verifyActionSuccessWithTimeout(button, initialText, opId, runId, timeoutMs = TIMEOUTS.VERIFICATION_TIMEOUT) {
      return new Promise(resolve => {
        let finished = false;

        const timer = this.setTimeoutGuarded(() => {
          if (!finished) {
            finished = true;
            resolve(false);
          }
        }, timeoutMs);

        const checkInterval = setInterval(() => {
          if (finished || !this.isValidRun(opId, runId)) {
            finished = true;
            clearInterval(checkInterval);
            clearTimeout(timer);
            resolve(false);
            return;
          }

          const classification = Detector.classifyButton(button);
          if (classification.status === 'PENDING') {
            finished = true;
            clearInterval(checkInterval);
            clearTimeout(timer);
            resolve(true);
            return;
          }

          const currentText = (button.textContent || '').trim().toLowerCase();
          if (currentText.includes('pending') || currentText.includes('invitation sent')) {
            finished = true;
            clearInterval(checkInterval);
            clearTimeout(timer);
            resolve(true);
            return;
          }

          const card = Detector.findCardContainer(button);
          if (card) {
            const cardText = (card.textContent || '').toLowerCase();
            if (cardText.includes('pending') || cardText.includes('invitation sent')) {
              finished = true;
              clearInterval(checkInterval);
              clearTimeout(timer);
              resolve(true);
              return;
            }
          }

          if (!button.isConnected || button.disabled) {
            finished = true;
            clearInterval(checkInterval);
            clearTimeout(timer);
            resolve(true);
            return;
          }
        }, 120);
      });
    }

    highlightCandidate(candidate) {
      this.clearHighlight();

      const target = candidate.cardElement || candidate.element;
      if (target) {
        target.classList.add('connectflow-highlighted-card');

        const badge = document.createElement('div');
        badge.className = 'connectflow-badge-indicator';
        badge.id = 'connectflow-active-badge';
        const mutuals = candidate.metadata.mutualConnections || 1;
        badge.textContent = `● Auto-Connecting (${mutuals} Mutuals)`;
        target.appendChild(badge);
      }
    }

    clearHighlight() {
      document.querySelectorAll('.connectflow-highlighted-card').forEach(el => {
        el.classList.remove('connectflow-highlighted-card');
      });

      const badge = document.getElementById('connectflow-active-badge');
      if (badge && badge.parentElement) {
        badge.remove();
      }
    }
  }

  window.connectFlowOrchestrator = new LinkedInOrchestrator();
})();
