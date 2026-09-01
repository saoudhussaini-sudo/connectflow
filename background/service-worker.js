/**
 * ConnectFlow - Background Service Worker
 * Coordinates state transitions, relays commands with message timeouts,
 * and maintains badge state.
 */

importScripts('../shared/constants.js', '../shared/session-state.js');

const { MAX_REQUESTS, STATES, MESSAGE_TYPES, TIMEOUTS } = self.ConnectFlowConstants;
const stateManager = self.ConnectFlowSessionState.instance;

stateManager.init().then(state => {
  updateBadge(state);
});

stateManager.subscribe(state => {
  updateBadge(state);
});

function updateBadge(state) {
  if (!chrome.action) return;

  const count = state.sentCount || 0;
  const status = state.status;

  if (status === STATES.LIMIT_REACHED) {
    chrome.action.setBadgeText({ text: '100' });
    chrome.action.setBadgeBackgroundColor({ color: '#222222' });
  } else if (status === STATES.SCANNING || status === STATES.PROCESSING || status === STATES.VERIFYING || status === STATES.WAITING_DELAY) {
    chrome.action.setBadgeText({ text: `${count}` });
    chrome.action.setBadgeBackgroundColor({ color: '#333333' });
  } else if (status === STATES.PAUSED) {
    chrome.action.setBadgeText({ text: 'II' });
    chrome.action.setBadgeBackgroundColor({ color: '#222222' });
  } else {
    chrome.action.setBadgeText({ text: count > 0 ? `${count}` : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#111111' });
  }
}

async function getActiveLinkedInTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0] && tabs[0].url && tabs[0].url.includes('linkedin.com')) {
    return tabs[0];
  }

  const allLinkedInTabs = await chrome.tabs.query({ url: '*://*.linkedin.com/*' });
  return allLinkedInTabs[0] || null;
}

/**
 * Sends message to content script with guaranteed timeout promise
 */
async function sendMessageToContentScript(tabId, message, timeoutMs = TIMEOUTS.MESSAGE_RESPONSE_TIMEOUT) {
  return new Promise(resolve => {
    let completed = false;

    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn(`[ConnectFlow BG] Message timeout to tab ${tabId} for type: ${message.type}`);
        resolve({ success: false, error: 'MESSAGE_TIMEOUT' });
      }
    }, timeoutMs);

    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: true });
          }
        }
      });
    } catch (err) {
      if (!completed) {
        completed = true;
        clearTimeout(timer);
        resolve({ success: false, error: err.message });
      }
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message || {};

  (async () => {
    switch (type) {
      case MESSAGE_TYPES.GET_SESSION_STATE: {
        const state = stateManager.getState();
        const settings = stateManager.getSettings();
        sendResponse({ success: true, state, settings });
        break;
      }

      case MESSAGE_TYPES.START_SESSION: {
        const tab = await getActiveLinkedInTab();
        if (!tab) {
          stateManager.logActivity('Please navigate to a LinkedIn page first.', 'warning');
          sendResponse({ success: false, error: 'NO_LINKEDIN_TAB', state: stateManager.getState() });
          return;
        }

        const newState = await stateManager.startSession();
        if (tab.id) {
          await sendMessageToContentScript(tab.id, {
            type: MESSAGE_TYPES.START_SESSION,
            payload: { state: newState }
          });
        }
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.PAUSE_SESSION: {
        const newState = await stateManager.pauseSession();
        const tab = await getActiveLinkedInTab();
        if (tab && tab.id) {
          await sendMessageToContentScript(tab.id, { type: MESSAGE_TYPES.PAUSE_SESSION });
        }
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.RESUME_SESSION: {
        const newState = await stateManager.resumeSession();
        const tab = await getActiveLinkedInTab();
        if (tab && tab.id) {
          await sendMessageToContentScript(tab.id, { type: MESSAGE_TYPES.RESUME_SESSION });
        }
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.STOP_SESSION: {
        const newState = await stateManager.stopSession();
        const tab = await getActiveLinkedInTab();
        if (tab && tab.id) {
          await sendMessageToContentScript(tab.id, { type: MESSAGE_TYPES.STOP_SESSION });
        }
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.RESET_SESSION: {
        const newState = await stateManager.resetSession();
        const tab = await getActiveLinkedInTab();
        if (tab && tab.id) {
          await sendMessageToContentScript(tab.id, { type: MESSAGE_TYPES.RESET_SESSION });
        }
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.STATE_TRANSITION: {
        const newState = await stateManager.transitionTo(
          payload?.nextState,
          payload?.statusDetail,
          payload?.profile
        );
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.PROFILE_DETECTED: {
        const newState = await stateManager.setDetectedProfile(payload?.profile || {});
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.REQUEST_PROCESSING: {
        const newState = await stateManager.transitionTo(
          STATES.PROCESSING,
          `Connecting with ${payload?.profile?.name || 'profile'}...`,
          payload?.profile
        );
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.REQUEST_VERIFYING: {
        const newState = await stateManager.transitionTo(
          STATES.VERIFYING,
          `Verifying invitation for ${payload?.profile?.name || 'profile'}...`,
          payload?.profile
        );
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.REQUEST_VERIFIED: {
        const newState = await stateManager.recordVerifiedRequest(payload?.profile);
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.REQUEST_TIMEOUT: {
        const newState = await stateManager.recordTimeout(payload?.stage || 'Unknown stage', payload?.profile);
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.REQUEST_FAILED: {
        const newState = await stateManager.recordError(payload?.error || 'Verification failed', payload?.profile);
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.PROFILE_SKIPPED: {
        const newState = await stateManager.recordSkipped(payload?.reason || 'Skipped', payload?.profile);
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.WAITING_NEXT_CYCLE: {
        const newState = await stateManager.transitionTo(
          STATES.WAITING_DELAY,
          `Waiting ${payload?.remainingSeconds || 10}s before next request (${stateManager.state.sentCount}/${MAX_REQUESTS})...`
        );
        sendResponse({ success: true, state: newState });
        break;
      }

      case MESSAGE_TYPES.ACTIVITY_LOG: {
        stateManager.logActivity(payload?.message || '', payload?.type || 'info');
        sendResponse({ success: true, state: stateManager.getState() });
        break;
      }

      case MESSAGE_TYPES.PING: {
        sendResponse({ success: true, status: 'pong' });
        break;
      }

      default:
        sendResponse({ success: false, error: 'UNKNOWN_MESSAGE_TYPE' });
        break;
    }
  })();

  return true;
});
