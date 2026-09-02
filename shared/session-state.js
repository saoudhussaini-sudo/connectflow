/**
 * ConnectFlow - Session State Manager
 * Authoritative state machine for automated mutual-connection loop,
 * fresh counter resets per session, live 5s countdown, and safety limits.
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
      this.state = { ...DEFAULT_STATE, activityFeed: [], diagnostics: { ...DEFAULT_STATE.diagnostics } };
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

      this.state.activityFeed = [entry, ...this.state.activityFeed].slice(0, 80);
      this.persist();
      this.notify();
    }

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
     * Starts a new session — automatically resets counter to 0 per user requirement
     */
    async startSession(resetCounter = true) {
      if (resetCounter) {
        this.state.sentCount = 0;
        this.state.skippedCount = 0;
        this.state.errorCount = 0;
      }

      this.state.sessionRunId = 'run_' + Date.now();
      this.state.status = STATES.SCANNING;
      this.state.statusDetail = 'Scanning for qualified profiles (≥1 mutual connection)...';
      this.state.sessionStartTime = Date.now();
      this.state.sessionEndTime = null;
      this.state.errorMessage = null;
      this.state.countdownSeconds = 0;
      this.state.currentProfile = null;

      this.logActivity('New automated session started (counter reset to 0/100). Filter: ≥1 mutual connection.', 'info');
      await this.persist();
      this.notify();
      return this.getState();
    }

    async setDetectedProfile(profile) {
      this.state.currentProfile = profile;
      this.state.status = STATES.PROCESSING;
      const count = profile.mutualConnections || 1;
      this.state.statusDetail = `Auto-connecting: ${profile.name} (${count} mutual connection${count > 1 ? 's' : ''})`;
      
      this.logActivity(`${profile.name} qualified (${count} mutuals) — sending request...`, 'info');

      await this.persist();
      this.notify();
      return this.getState();
    }

    async setSkippedProfile(profile, reason = '0 mutual connections') {
      this.state.skippedCount += 1;
      const name = profile?.name || 'Profile';
      this.logActivity(`${name} skipped — ${reason}`, 'info');
      await this.persist();
      this.notify();
      return this.getState();
    }

    async recordVerifiedRequest(profile) {
      this.state.sentCount += 1;
      const current = this.state.sentCount;
      const name = profile?.name || this.state.currentProfile?.name || 'Candidate';
      
      this.logActivity(`Request sent — ${current}/${MAX_REQUESTS} (${name})`, 'success');
      this.state.currentProfile = null;

      if (this.state.sentCount >= MAX_REQUESTS) {
        this.state.status = STATES.LIMIT_REACHED;
        this.state.statusDetail = '100 connection requests sent. Limit reached.';
        this.state.sessionEndTime = Date.now();
        this.logActivity('Session limit reached (100/100). Automated loop completed.', 'limit');
      } else {
        this.state.status = STATES.DELAYING;
        this.state.countdownSeconds = 5;
        this.state.statusDetail = `5s cooldown before next auto-send (${current}/${MAX_REQUESTS})...`;
        this.logActivity('5-second cooldown started.', 'info');
      }

      await this.persist();
      this.notify();
      return this.getState();
    }

    async updateCountdown(seconds) {
      this.state.countdownSeconds = seconds;
      if (seconds > 0) {
        this.state.status = STATES.DELAYING;
        this.state.statusDetail = `Next auto-send in ${seconds}s...`;
      } else if (this.state.status === STATES.DELAYING) {
        this.state.status = STATES.SCANNING;
        this.state.statusDetail = 'Scanning for next qualified profile...';
        this.logActivity('Scanning for next qualified profile...', 'info');
      }
      await this.persist();
      this.notify();
      return this.getState();
    }

    async updateDiagnostics(diagData) {
      if (!diagData) return;
      this.state.diagnostics = {
        ...this.state.diagnostics,
        ...diagData
      };
      await this.persist();
      this.notify();
    }

    async pauseSession() {
      this.state.status = STATES.PAUSED;
      this.state.statusDetail = 'Session paused by user.';
      this.state.countdownSeconds = 0;
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
      this.state.statusDetail = 'Resumed. Auto-scanning for qualified profiles...';
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
      this.state.countdownSeconds = 0;
      this.state.sessionEndTime = Date.now();
      this.logActivity('Session stopped.', 'warning');
      await this.persist();
      this.notify();
      return this.getState();
    }

    async resetSession() {
      this.state = {
        ...DEFAULT_STATE,
        sentCount: 0,
        skippedCount: 0,
        errorCount: 0,
        activityFeed: [],
        diagnostics: { ...DEFAULT_STATE.diagnostics }
      };
      this.logActivity('Session reset to 0/100. Ready to start.', 'info');
      await this.persist();
      this.notify();
      return this.getState();
    }

    async recordTimeout(stage, profile) {
      this.state.errorCount += 1;
      const name = profile?.name || this.state.currentProfile?.name || 'Profile';
      this.state.status = STATES.ERROR;
      this.state.statusDetail = `Operation timed out (${stage}) on ${name}.`;
      this.state.errorMessage = `Timeout at stage: ${stage}`;
      this.logActivity(`Action timed out on ${name} (${stage}). Request not counted. Continuing...`, 'warning');
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
      this.logActivity(`Error on ${name}: ${errorMessage}. Continuing...`, 'error');
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
