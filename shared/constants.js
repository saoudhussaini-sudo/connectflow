/**
 * ConnectFlow - Shared Constants
 * Strict State Machine, Timeouts & Mutual Connection Filter Config
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ConnectFlowConstants = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Hard Session Ceiling
  const MAX_REQUESTS = 100;

  // Exact 5-Second Delay between user-confirmed requests
  const REQUEST_DELAY_MS = 5000;

  // Minimum required mutual connections to qualify
  const MIN_MUTUAL_CONNECTIONS = 1;

  // Watchdog & Asynchronous Timeouts (ms)
  const TIMEOUTS = {
    GLOBAL_STEP_WATCHDOG: 20000,
    SCAN_TIMEOUT: 10000,
    CLICK_ACTION_TIMEOUT: 4000,
    MODAL_HANDLER_TIMEOUT: 3500,
    VERIFICATION_TIMEOUT: 5000,
    MESSAGE_RESPONSE_TIMEOUT: 4000
  };

  // Authoritative State Machine States
  const STATES = {
    IDLE: 'IDLE',
    SCANNING: 'SCANNING',
    PROFILE_FOUND: 'PROFILE_FOUND',
    QUALIFYING: 'QUALIFYING',
    PROFILE_READY: 'PROFILE_READY',
    WAITING_FOR_CONFIRMATION: 'WAITING_FOR_CONFIRMATION',
    PROCESSING: 'PROCESSING',
    VERIFYING: 'VERIFYING',
    REQUEST_SENT: 'REQUEST_SENT',
    DELAYING: 'DELAYING',
    SKIPPED: 'SKIPPED',
    PAUSED: 'PAUSED',
    STOPPED: 'STOPPED',
    LIMIT_REACHED: 'LIMIT_REACHED',
    ERROR: 'ERROR'
  };

  // Message Types across Extension Components
  const MESSAGE_TYPES = {
    START_SESSION: 'START_SESSION',
    PAUSE_SESSION: 'PAUSE_SESSION',
    RESUME_SESSION: 'RESUME_SESSION',
    STOP_SESSION: 'STOP_SESSION',
    RESET_SESSION: 'RESET_SESSION',
    GET_SESSION_STATE: 'GET_SESSION_STATE',
    UPDATE_SESSION_STATE: 'UPDATE_SESSION_STATE',

    // User-Confirmed Action
    CONFIRM_SEND_REQUEST: 'CONFIRM_SEND_REQUEST',
    SKIP_CURRENT_PROFILE: 'SKIP_CURRENT_PROFILE',

    // Content Script -> Background Events
    STATE_TRANSITION: 'STATE_TRANSITION',
    PROFILE_QUALIFIED: 'PROFILE_QUALIFIED',
    PROFILE_DISQUALIFIED: 'PROFILE_DISQUALIFIED',
    REQUEST_PROCESSING: 'REQUEST_PROCESSING',
    REQUEST_VERIFYING: 'REQUEST_VERIFYING',
    REQUEST_VERIFIED: 'REQUEST_VERIFIED',
    COUNTDOWN_TICK: 'COUNTDOWN_TICK',
    REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
    REQUEST_FAILED: 'REQUEST_FAILED',

    ACTIVITY_LOG: 'ACTIVITY_LOG',
    UPDATE_DIAGNOSTICS: 'UPDATE_DIAGNOSTICS',
    PING: 'PING'
  };

  const DEFAULT_STATE = {
    status: STATES.IDLE,
    statusDetail: 'Ready to start.',
    sentCount: 0,
    skippedCount: 0,
    errorCount: 0,
    maxRequests: MAX_REQUESTS,
    currentProfile: null,
    countdownSeconds: 0,
    activityFeed: [],
    sessionRunId: null,
    diagnostics: {
      profileCardsDetected: 0,
      connectButtonsDetected: 0,
      profilesWithMutuals: 0,
      profilesWithoutMutuals: 0,
      alreadyProcessed: 0
    },
    errorMessage: null,
    sessionStartTime: null,
    sessionEndTime: null
  };

  const DEFAULT_SETTINGS = {
    maxRequests: MAX_REQUESTS,
    requestDelayMs: REQUEST_DELAY_MS,
    minMutualConnections: MIN_MUTUAL_CONNECTIONS,
    debugMode: true
  };

  return {
    MAX_REQUESTS,
    REQUEST_DELAY_MS,
    MIN_MUTUAL_CONNECTIONS,
    TIMEOUTS,
    STATES,
    MESSAGE_TYPES,
    DEFAULT_STATE,
    DEFAULT_SETTINGS
  };
});
