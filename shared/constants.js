/**
 * ConnectFlow - Shared Constants
 * Strict State Machine, Timeouts & Watchdog Configurations
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

  // Automated Loop Delay (5 seconds between requests)
  const LOOP_INTERVAL_MS = 5000;

  // Watchdog & Asynchronous Timeouts (ms)
  const TIMEOUTS = {
    GLOBAL_STEP_WATCHDOG: 20000,   // 20s max for any single profile cycle
    SCAN_TIMEOUT: 10000,           // 10s scan timeout before scrolling/retrying
    CLICK_ACTION_TIMEOUT: 4000,    // 4s to trigger click & verify interaction
    MODAL_HANDLER_TIMEOUT: 3500,   // 3.5s max to detect & dismiss note dialog
    VERIFICATION_TIMEOUT: 5000,    // 5s max to verify 'Pending' status
    MESSAGE_RESPONSE_TIMEOUT: 4000 // 4s timeout on runtime messages
  };

  // Authoritative State Machine States
  const STATES = {
    IDLE: 'IDLE',
    SCANNING: 'SCANNING',
    PROFILE_FOUND: 'PROFILE_FOUND',
    PREPARING: 'PREPARING',
    PROCESSING: 'PROCESSING',
    VERIFYING: 'VERIFYING',
    WAITING_DELAY: 'WAITING_DELAY',
    COMPLETED_STEP: 'COMPLETED_STEP',
    SKIPPED: 'SKIPPED',
    TIMEOUT: 'TIMEOUT',
    ERROR: 'ERROR',
    PAUSED: 'PAUSED',
    STOPPED: 'STOPPED',
    LIMIT_REACHED: 'LIMIT_REACHED'
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

    // Content Script -> Background Events
    STATE_TRANSITION: 'STATE_TRANSITION',
    PROFILE_DETECTED: 'PROFILE_DETECTED',
    REQUEST_PROCESSING: 'REQUEST_PROCESSING',
    REQUEST_VERIFYING: 'REQUEST_VERIFYING',
    REQUEST_VERIFIED: 'REQUEST_VERIFIED',
    REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
    REQUEST_FAILED: 'REQUEST_FAILED',
    PROFILE_SKIPPED: 'PROFILE_SKIPPED',
    WAITING_NEXT_CYCLE: 'WAITING_NEXT_CYCLE',

    ACTIVITY_LOG: 'ACTIVITY_LOG',
    PING: 'PING'
  };

  const PROFILE_STATUS = {
    CONNECT_AVAILABLE: 'CONNECT_AVAILABLE',
    PENDING: 'PENDING',
    MESSAGE: 'MESSAGE',
    FOLLOW: 'FOLLOW',
    FOLLOWING: 'FOLLOWING',
    CONNECTED: 'CONNECTED',
    UNKNOWN: 'UNKNOWN'
  };

  const DEFAULT_STATE = {
    status: STATES.IDLE,
    statusDetail: 'Ready to start automated loop.',
    sentCount: 0,
    skippedCount: 0,
    errorCount: 0,
    maxRequests: MAX_REQUESTS,
    currentProfile: null,
    activityFeed: [],
    sessionRunId: null,
    nextCycleTime: null,
    errorMessage: null,
    sessionStartTime: null,
    sessionEndTime: null
  };

  const DEFAULT_SETTINGS = {
    maxRequests: MAX_REQUESTS,
    loopIntervalMs: LOOP_INTERVAL_MS,
    debugMode: true
  };

  return {
    MAX_REQUESTS,
    LOOP_INTERVAL_MS,
    TIMEOUTS,
    STATES,
    MESSAGE_TYPES,
    PROFILE_STATUS,
    DEFAULT_STATE,
    DEFAULT_SETTINGS
  };
});
