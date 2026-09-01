/**
 * ConnectFlow - Session State Manager
 * Authoritative state machine with transition validation, atomic counters,
 * activity logging, and watchdog timeout handling.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./constants.js'));
  } else {
    root.ConnectFlowSessionState = factory(root.ConnectFlowConstants);
  }
})(typeof self !== 'undefined' ? self : this, function (Constants) {
  'use strict';

  const { MAX_REQUESTS, STATES, DEFAULT_STATE, DEFAULT_SETTINGS } = Constants;

  class SessionStateManager {
    constructor() {
      this.state = { ...DEFAULT_STATE, activityFeed: [] };
      this.settings = { ...DEFAULT_SETTINGS };
      this.listeners = [];
      this.initialized = false;
    }

    async init() {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          const data = await chrome.storage.local.get(['cf_session_state', 'cf_settings']);
          if (data.cf_session_state) {
            this.state = { ...this.state, ...data.cf_session_state };
          }
          if (data.cf_settings) {
            this.settings = { ...this.settings, ...data.cf_settings };
          }
        } catch (e) {
          console.warn('[ConnectFlow] State init error:', e);
        }
      }
      this.initialized = true;
      return this.getState();
    }

    subscribe(callback) {
      if (typeof callback === 'function') {
        this.listeners.push(callback);
      }
      return () => {
        this.listeners = this.listeners.filter(cb => cb !== callback);
      };
    }

    notify() {
      const currentState = this.getState();
      this.listeners.forEach(cb => {
        try {
          cb(currentState);
        } catch (e) {
          console.error('[ConnectFlow] State listener error:', e);
        }
      });
    }

    async persist() {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          await chrome.storage.local.set({
            cf_session_state: this.state,
            cf_settings: this.settings
          });
        } catch (e) {
          console.error('[ConnectFlow] Storage persist error:', e);
        }
      }
    }

    getState() {
      return JSON.parse(JSON.stringify(this.state));
    }

    getSettings() {
      return JSON.parse(JSON.stringify(this.settings));
    }

    getFormattedTime() {
      const now = new Date();
      return now.toTimeString().split(' ')[0]; // HH:MM:SS
    }

    logActivity(message, type = 'info') {
      const time = this.getFormattedTime();
      const entry = {
        id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        time,
        timestamp: Date.now(),
        message,
        type
      };

      // Keep latest 80 items
      this.state.activityFeed = [entry, ...this.state.activityFeed].slice(0, 80);
      this.persist();
      this.notify();
    }

    /**
     * Authoritative State Transition
     */
    async transitionTo(nextState, statusDetail = '', profile = null) {
      if (!STATES[nextState]) {
        console.error(`[ConnectFlow] Invalid state transition requested: ${nextState}`);
        return this.getState();
      }

      this.state.status = nextState;
      if (statusDetail) {
        this.state.statusDetail = statusDetail;
      }
      if (profile !== undefined) {
        this.state.currentProfile = profile;
      }

      await this.persist();
      this.notify();
      return this.getState();
    }

    /**
     * Start automated session
     */
    async startSession() {
      if (this.state.sentCount >= MAX_REQUESTS) {
        this.state.status = STATES.LIMIT_REACHED;
        this.state.statusDetail = 'Session complete. 100/100 limit reached.';
        this.logActivity('Session complete — 100/100 limit reached.', 'limit');
        await this.persist();
        this.notify();
        return this.getState();
      }

      this.state.sessionRunId = 'run_' + Date.now();
      this.state.status = STATES.SCANNING;
      this.state.statusDetail = 'Scanning for eligible profiles on page...';
      if (!this.state.sessionStartTime) {
        this.state.sessionStartTime = Date.now();
      }
      this.state.errorMessage = null;
      this.logActivity('Automated 10s session started.', 'info');
      await this.persist();
      this.notify();
      return this.getState();
    }

    async pauseSession() {
      this.state.status = STATES.PAUSED;
      this.state.statusDetail = 'Session paused by user.';
      this.logActivity('Session paused.', 'warning');
      await this.persist();
      this.notify();
      return this.getState();
    }

    async resumeSession() {
      if (this.state.sentCount >= MAX_REQUESTS) {
        this.state.status = STATES.LIMIT_REACHED;
        this.state.statusDetail = 'Session limit reached (100/100).';
        await this.persist();
        this.notify();
        return this.getState();
      }

      this.state.status = STATES.SCANNING;
      this.state.statusDetail = 'Resumed. Scanning for profiles...';
      this.logActivity('Session resumed.', 'info');
      await this.persist();
      this.notify();
      return this.getState();
    }

    async stopSession() {
      this.state.status = STATES.STOPPED;
      this.state.statusDetail = 'Session stopped.';
      this.state.currentProfile = null;
      this.state.sessionRunId = null;
      this.state.sessionEndTime = Date.now();
      this.logActivity('Session stopped.', 'warning');
      await this.persist();
      this.notify();
      return this.getState();
    }

    async resetSession() {
      this.state = {
        ...DEFAULT_STATE,
        activityFeed: []
      };
      this.logActivity('Session reset. Ready to start.', 'info');
      await this.persist();
      this.notify();
      return this.getState();
    }

    async setDetectedProfile(profile) {
      if (this.state.status !== STATES.SCANNING && this.state.status !== STATES.WAITING_DELAY) {
        return this.getState();
      }

      this.state.currentProfile = profile;
      this.state.status = STATES.PROFILE_FOUND;
      this.state.statusDetail = `Profile found: ${profile.name || 'LinkedIn Member'}`;
      this.logActivity(`Profile detected: ${profile.name || 'Candidate'}`, 'info');
      await this.persist();
      this.notify();
      return this.getState();
    }

    async recordVerifiedRequest(profile) {
      if (this.state.sentCount >= MAX_REQUESTS) {
        this.state.status = STATES.LIMIT_REACHED;
        this.state.statusDetail = 'Session complete. 100/100 limit reached.';
        await this.persist();
        this.notify();
        return this.getState();
      }

      this.state.sentCount += 1;
      const current = this.state.sentCount;
      const name = profile?.name || this.state.currentProfile?.name || 'Candidate';
      
      this.logActivity(`Request sent to ${name} (${current}/${MAX_REQUESTS})`, 'success');
      this.state.currentProfile = null;

      if (this.state.sentCount >= MAX_REQUESTS) {
        this.state.status = STATES.LIMIT_REACHED;
        this.state.statusDetail = '100 connection requests sent. Limit reached.';
        this.state.sessionEndTime = Date.now();
        this.logActivity('Session limit reached (100/100). Automated loop finished.', 'limit');
      } else {
        this.state.status = STATES.WAITING_DELAY;
        this.state.statusDetail = `Waiting 10s before next request (${current}/${MAX_REQUESTS})...`;
      }

      await this.persist();
      this.notify();
      return this.getState();
    }

    async recordTimeout(stage, profile) {
      this.state.errorCount += 1;
      const name = profile?.name || this.state.currentProfile?.name || 'Profile';
      this.state.status = STATES.TIMEOUT;
      this.state.statusDetail = `Operation timed out (${stage}) on ${name}.`;
      this.state.errorMessage = `Timeout at stage: ${stage}`;
      this.logActivity(`Action timed out on ${name} (${stage}). Request not counted. Recovering...`, 'warning');
      this.state.currentProfile = null;
      await this.persist();
      this.notify();
      return this.getState();
    }

    async recordError(errorMessage, profile) {
      this.state.errorCount += 1;
      const name = profile?.name || this.state.currentProfile?.name || 'Profile';
      this.state.status = STATES.ERROR;
      this.state.statusDetail = `Error: ${errorMessage}`;
      this.state.errorMessage = errorMessage;
      this.logActivity(`Error on ${name}: ${errorMessage}. Request not counted.`, 'error');
      this.state.currentProfile = null;
      await this.persist();
      this.notify();
      return this.getState();
    }

    async recordSkipped(reason = 'Skipped', profile) {
      this.state.skippedCount += 1;
      const name = profile?.name || this.state.currentProfile?.name || 'Profile';
      this.state.status = STATES.SKIPPED;
      this.state.statusDetail = `Skipped: ${name} (${reason})`;
      this.logActivity(`Skipped ${name} (${reason})`, 'info');
      this.state.currentProfile = null;
      await this.persist();
      this.notify();
      return this.getState();
    }
  }

  return {
    SessionStateManager,
    instance: new SessionStateManager()
  };
});
