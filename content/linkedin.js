/**
 * ConnectFlow - LinkedIn Content Script Orchestrator
 * High-reliability, watchdog-protected automated 5-second connection loop.
 * Guarantees zero hanging states with strict step timeouts, deduplication,
 * resource tracking, and automatic self-healing recovery.
 */

(function () {
  'use strict';

  const Constants = window.ConnectFlowConstants;
  const Detector = window.ConnectFlowLinkedInDetector;

  if (!Constants || !Detector) {
    console.error('[ConnectFlow] Dependencies missing in content context.');
    return;
  }

  const { STATES, MESSAGE_TYPES, TIMEOUTS, MAX_REQUESTS, LOOP_INTERVAL_MS } = Constants;
  const DEBUG = true;

  function logDebug(tag, ...args) {
    if (DEBUG) {
      const time = new Date().toTimeString().split(' ')[0];
      console.log(`%c[ConnectFlow] [${time}] ${tag}:`, 'color: #ffffff; font-weight: bold;', ...args);
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
            this.sentCount = payload?.state?.sentCount || 0;
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

    setIntervalGuarded(fn, intervalMs) {
      const intervalId = setInterval(() => {
        try {
          fn();
        } catch (e) {
          logDebug('ERROR in setIntervalGuarded', e);
        }
      }, intervalMs);
      this.activeTimers.add(intervalId);
      return () => {
        clearInterval(intervalId);
        this.activeTimers.delete(intervalId);
      };
    }

    cleanupCurrentOperation() {
      for (const timerId of this.activeTimers) {
        clearTimeout(timerId);
        clearInterval(timerId);
      }
      this.activeTimers.clear();

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
      logDebug('START_SESSION', 'Initializing run (5s interval)...');
      this.isRunning = true;
      this.sessionRunId = 'run_' + Date.now();
      this.currentOperationId = 0;
      this.cleanupCurrentOperation();
      this.processNextCycle();
    }

    pause() {
      logDebug('PAUSE_SESSION', 'Pausing active loop...');
      this.isRunning = false;
      this.cleanupCurrentOperation();
    }

    resume() {
      logDebug('RESUME_SESSION', 'Resuming loop...');
      this.isRunning = true;
      this.cleanupCurrentOperation();
      this.processNextCycle();
    }

    stop() {
      logDebug('STOP_SESSION', 'Stopping and cleaning up all operations...');
      this.isRunning = false;
      this.sessionRunId = null;
      this.cleanupCurrentOperation();
    }

    reset() {
      logDebug('RESET_SESSION', 'Resetting session state and deduplication cache...');
      this.stop();
      this.sentCount = 0;
      this.processedProfileKeys.clear();
      this.processedElements = new WeakSet();
    }

    async processNextCycle() {
      if (!this.isRunning || this.isProcessing) return;

      const opId = ++this.currentOperationId;
      const runId = this.sessionRunId;

      logDebug('LOOP_STEP', `Starting cycle opId=${opId}, current sentCount=${this.sentCount}/${MAX_REQUESTS}`);

      if (this.sentCount >= MAX_REQUESTS) {
        logDebug('LIMIT_REACHED', '100 requests reached. Stopping session.');
        this.stop();
        return;
      }

      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.STATE_TRANSITION,
        payload: { nextState: STATES.SCANNING, statusDetail: 'Scanning for eligible profiles...' }
      });

      const candidate = this.findNextEligibleProfile();

      if (!candidate) {
        logDebug('SCAN', 'No eligible connect button visible in current view. Scrolling...');
        
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.ACTIVITY_LOG,
          payload: { message: 'No eligible connect button visible. Scrolling page...', type: 'info' }
        });

        window.scrollBy({ top: 400, behavior: 'smooth' });

        this.setTimeoutGuarded(() => {
          if (this.isValidRun(opId, runId)) {
            const retryCandidate = this.findNextEligibleProfile();
            if (retryCandidate) {
              this.executeCandidateLifecycle(retryCandidate, opId, runId);
            } else {
              this.scheduleNextCycle(2000);
            }
          }
        }, 1500);

        return;
      }

      await this.executeCandidateLifecycle(candidate, opId, runId);
    }

    findNextEligibleProfile() {
      const candidates = Detector.scanProfiles(document);
      for (const candidate of candidates) {
        const key = candidate.metadata.profileKey;
        const btn = candidate.element;

        if (!this.processedProfileKeys.has(key) && !this.processedElements.has(btn)) {
          return candidate;
        }
      }
      return null;
    }

    async executeCandidateLifecycle(candidate, opId, runId) {
      if (!this.isValidRun(opId, runId)) return;

      this.isProcessing = true;
      this.currentCandidate = candidate;

      const profile = candidate.metadata;
      const button = candidate.element;
      const initialText = button.textContent || '';

      this.processedProfileKeys.add(profile.profileKey);
      this.processedElements.add(button);

      logDebug('PROFILE_FOUND', `Processing: ${profile.name} (Key: ${profile.profileKey})`);

      try {
        candidate.cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {
        button.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      this.highlightCandidate(candidate);

      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.PROFILE_DETECTED,
        payload: { profile }
      });

      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.REQUEST_PROCESSING,
        payload: { profile }
      });

      let isStepFinished = false;
      const watchdogTimer = this.setTimeoutGuarded(() => {
        if (!isStepFinished && this.isValidRun(opId, runId)) {
          logDebug('WATCHDOG_TRIGGERED', `Global watchdog timeout expired on ${profile.name}`);
          isStepFinished = true;
          this.handleStepTimeout('GLOBAL_STEP_WATCHDOG', profile, opId, runId);
        }
      }, TIMEOUTS.GLOBAL_STEP_WATCHDOG);

      try {
        logDebug('ACTION_CLICK', `Clicking Connect button for ${profile.name}`);
        button.click();

        logDebug('MODAL_CHECK', `Checking for invitation modal dialog...`);
        await this.handlePotentialModalWithTimeout(opId, runId, TIMEOUTS.MODAL_HANDLER_TIMEOUT);

        if (!this.isValidRun(opId, runId) || isStepFinished) return;

        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.REQUEST_VERIFYING,
          payload: { profile }
        });

        logDebug('VERIFYING', `Verifying status changed to Pending...`);
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
        } else {
          logDebug('VERIFICATION_FAILED', `Verification timed out or not accepted for ${profile.name}`);
          this.clearHighlight();
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.REQUEST_FAILED,
            payload: { error: 'Status did not change to Pending within timeout', profile }
          });
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
        }
      } finally {
        this.isProcessing = false;
        this.currentCandidate = null;

        if (this.sentCount >= MAX_REQUESTS) {
          logDebug('LIMIT_REACHED', '100 requests reached. Halting session.');
          this.stop();
          return;
        }

        if (this.isRunning && this.sessionRunId === runId) {
          logDebug('SCHEDULE_NEXT', `Waiting ${LOOP_INTERVAL_MS / 1000}s before next cycle...`);
          
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.WAITING_NEXT_CYCLE,
            payload: { remainingSeconds: 5 }
          });

          this.scheduleNextCycle(LOOP_INTERVAL_MS);
        }
      }
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
        this.scheduleNextCycle(1500);
      }
    }

    scheduleNextCycle(delayMs = LOOP_INTERVAL_MS) {
      this.setTimeoutGuarded(() => {
        if (this.isRunning) {
          this.processNextCycle();
        }
      }, delayMs);
    }

    isValidRun(opId, runId) {
      return this.isRunning && this.sessionRunId === runId && this.currentOperationId === opId;
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

        const checkInterval = this.setIntervalGuarded(() => {
          if (finished || !this.isValidRun(opId, runId)) {
            finished = true;
            checkInterval();
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
              checkInterval();
              clearTimeout(timer);
              sendBtn.click();
              this.setTimeoutGuarded(resolve, 250);
              return;
            }

            const modalText = (modal.textContent || '').toLowerCase();
            if (modalText.includes("you've reached the weekly invitation limit") || modalText.includes('invitation limit')) {
              finished = true;
              checkInterval();
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

        const checkInterval = this.setIntervalGuarded(() => {
          if (finished || !this.isValidRun(opId, runId)) {
            finished = true;
            checkInterval();
            clearTimeout(timer);
            resolve(false);
            return;
          }

          const classification = Detector.classifyButton(button);
          if (classification.status === 'PENDING') {
            finished = true;
            checkInterval();
            clearTimeout(timer);
            resolve(true);
            return;
          }

          const currentText = (button.textContent || '').trim().toLowerCase();
          if (currentText.includes('pending') || currentText.includes('invitation sent')) {
            finished = true;
            checkInterval();
            clearTimeout(timer);
            resolve(true);
            return;
          }

          const card = Detector.findCardContainer(button);
          if (card) {
            const cardText = (card.textContent || '').toLowerCase();
            if (cardText.includes('pending') || cardText.includes('invitation sent')) {
              finished = true;
              checkInterval();
              clearTimeout(timer);
              resolve(true);
              return;
            }
          }

          if (!button.isConnected || button.disabled) {
            finished = true;
            checkInterval();
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
        badge.textContent = 'Auto Connecting';
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
