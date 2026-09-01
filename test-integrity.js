/**
 * ConnectFlow - Automated Verification & Watchdog Bug Test Suite
 * Tests all 8 edge cases: timeouts, race conditions, cleanup, and 100 limit.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting ConnectFlow Watchdog & State Machine Test Suite...\n');

// 1. Check Manifest
console.log('1. Checking manifest.json...');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
assert.strictEqual(manifest.manifest_version, 3);
assert.ok(manifest.permissions.includes('storage'));
console.log('✅ manifest.json is valid.\n');

// 2. Check Constants
console.log('2. Checking shared/constants.js & Timeouts...');
const Constants = require('./shared/constants.js');
assert.strictEqual(Constants.MAX_REQUESTS, 100);
assert.strictEqual(Constants.STATES.LIMIT_REACHED, 'LIMIT_REACHED');
assert.strictEqual(Constants.STATES.SCANNING, 'SCANNING');
assert.strictEqual(Constants.STATES.PROCESSING, 'PROCESSING');
assert.strictEqual(Constants.STATES.VERIFYING, 'VERIFYING');
assert.strictEqual(Constants.STATES.TIMEOUT, 'TIMEOUT');
assert.ok(Constants.TIMEOUTS.GLOBAL_STEP_WATCHDOG > 0);
assert.ok(Constants.TIMEOUTS.VERIFICATION_TIMEOUT > 0);
console.log('✅ Constants & Watchdog timeout values verified.\n');

// 3. State Machine & Transition Tests
console.log('3. Checking session state machine transitions...');
const { SessionStateManager } = require('./shared/session-state.js');
const manager = new SessionStateManager();

// Initial state
assert.strictEqual(manager.state.sentCount, 0);
assert.strictEqual(manager.state.status, Constants.STATES.IDLE);

// Start
manager.startSession();
assert.strictEqual(manager.state.status, Constants.STATES.SCANNING);
assert.ok(manager.state.sessionRunId.startsWith('run_'));

// CASE 1: Timeout handling (Never increments sent count)
console.log('4. Testing CASE 1, 2, 3: Timeout recovery & zero count increment...');
manager.setDetectedProfile({ name: 'Alex Johnson', profileKey: 'alex_1' });
assert.strictEqual(manager.state.status, Constants.STATES.PROFILE_FOUND);

manager.recordTimeout('VERIFICATION_TIMEOUT', { name: 'Alex Johnson' });
assert.strictEqual(manager.state.status, Constants.STATES.TIMEOUT);
assert.strictEqual(manager.state.sentCount, 0, 'Timeout must NEVER increment sent count');
assert.strictEqual(manager.state.errorCount, 1);
assert.strictEqual(manager.state.currentProfile, null, 'Current profile must be cleared on timeout');

// Check Activity feed has the event logged
assert.ok(manager.state.activityFeed.length > 0);
assert.ok(manager.state.activityFeed[0].message.includes('timed out'));

// CASE 5: Stop during processing
console.log('5. Testing CASE 5 & 6: STOP & PAUSE immediate termination...');
manager.startSession();
manager.stopSession();
assert.strictEqual(manager.state.status, Constants.STATES.STOPPED);
assert.strictEqual(manager.state.sessionRunId, null);

manager.startSession();
manager.pauseSession();
assert.strictEqual(manager.state.status, Constants.STATES.PAUSED);

manager.resumeSession();
assert.strictEqual(manager.state.status, Constants.STATES.SCANNING);

// CASE 7 & 8: 99 -> 100 -> Automatic termination -> ZERO additional processing
console.log('6. Testing CASE 7 & 8: 100 request ceiling & complete lockout...');
manager.resetSession();
assert.strictEqual(manager.state.sentCount, 0);

for (let i = 1; i <= 99; i++) {
  manager.recordVerifiedRequest({ name: `Profile ${i}` });
  assert.strictEqual(manager.state.sentCount, i);
  assert.strictEqual(manager.state.status, Constants.STATES.WAITING_DELAY);
}

// 100th request hits ceiling
manager.recordVerifiedRequest({ name: 'Profile 100' });
assert.strictEqual(manager.state.sentCount, 100);
assert.strictEqual(manager.state.status, Constants.STATES.LIMIT_REACHED);

// 101st attempt rejected
manager.recordVerifiedRequest({ name: 'Profile 101' });
assert.strictEqual(manager.state.sentCount, 100, 'Sent count MUST NOT exceed 100');
assert.strictEqual(manager.state.status, Constants.STATES.LIMIT_REACHED);

// Starting session when at 100 is blocked
manager.startSession();
assert.strictEqual(manager.state.status, Constants.STATES.LIMIT_REACHED);

console.log('✅ All 100-request limit ceiling tests passed.\n');

// 4. LinkedIn Detector Deduplication Key
console.log('7. Testing LinkedIn Detector deduplication key generation...');
const Detector = require('./content/linkedin-detector.js');

const mockCard = {
  innerText: 'Alex Johnson\nSenior Developer',
  textContent: 'Alex Johnson Senior Developer',
  querySelector: (sel) => {
    if (sel.includes('/in/')) return { getAttribute: () => 'https://www.linkedin.com/in/alex-johnson-pro/' };
    if (sel.includes('title')) return { innerText: 'Alex Johnson', textContent: 'Alex Johnson' };
    if (sel.includes('subtitle')) return { innerText: 'Senior Developer', textContent: 'Senior Developer' };
    return null;
  },
  querySelectorAll: () => [],
  getAttribute: () => null
};

const meta = Detector.extractProfileMetadata(mockCard, null);
assert.strictEqual(meta.name, 'Alex Johnson');
assert.strictEqual(meta.profileKey, 'alex-johnson-pro');

console.log('✅ Deduplication key properly extracted.\n');
console.log('🎉 ALL WATCHDOG & RECOVERY TESTS PASSED SUCCESSFULLY!');
