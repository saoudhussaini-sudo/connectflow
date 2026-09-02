/**
 * ConnectFlow - Automated Verification & Scanner Integrity Test Suite
 * Tests 0-Reset Counter on New Session, Automated Send Execution (No User Permission Required),
 * Mutual Connection Filtering (≥1), Exact 5s Cooldown, and 100-Request Hard Limit.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting ConnectFlow Automated & Zero-Reset Integrity Test Suite...\n');

// 1. Check Manifest
console.log('1. Checking manifest.json...');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
assert.strictEqual(manifest.manifest_version, 3);
assert.ok(manifest.permissions.includes('storage'));
console.log('✅ manifest.json is valid.\n');

// 2. Check Constants
console.log('2. Checking shared/constants.js...');
const Constants = require('./shared/constants.js');
assert.strictEqual(Constants.MAX_REQUESTS, 100);
assert.strictEqual(Constants.REQUEST_DELAY_MS, 5000);
assert.strictEqual(Constants.MIN_MUTUAL_CONNECTIONS, 1);
console.log('✅ Constants verified.\n');

// 3. Test LinkedIn Detector Multi-Strategy Discovery & Mutual Connection Filtering
console.log('3. Testing Mutual Connection Qualification Filter (≥1 required)...');
const Detector = require('./content/linkedin-detector.js');

function createMockElement(tag, options = {}) {
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    textContent: options.text || '',
    innerText: options.text || '',
    className: options.className || '',
    disabled: !!options.disabled,
    attributes: options.attributes || {},
    children: options.children || [],
    parentElement: options.parentElement || null,
    offsetWidth: options.hidden ? 0 : 120,
    offsetHeight: options.hidden ? 0 : 36,
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    querySelectorAll(selector) {
      const matched = [];
      function traverse(node) {
        for (const child of node.children) {
          const matchBtn = selector.includes('button') && child.tagName === 'BUTTON';
          const matchA = selector.includes('a') && child.tagName === 'A';
          const matchSpan = selector.includes('span') && child.tagName === 'SPAN';
          const matchDiv = selector.includes('div') && child.tagName === 'DIV';

          if (matchBtn || matchA || matchSpan || matchDiv) {
            matched.push(child);
          }
          traverse(child);
        }
      }
      traverse(this);
      return matched;
    },
    querySelector(selector) {
      const res = this.querySelectorAll(selector);
      return res[0] || null;
    },
    closest(selector) {
      let cur = this;
      while (cur) {
        if (selector.includes('discover-person-card') && cur.className.includes('discover-person-card')) return cur;
        if (selector.includes('entity-result') && cur.className.includes('entity-result')) return cur;
        if (selector.includes('artdeco-card') && cur.className.includes('artdeco-card')) return cur;
        if (selector === 'li' && cur.tagName === 'LI') return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    getBoundingClientRect() {
      return options.hidden ? { width: 0, height: 0 } : { width: 120, height: 36 };
    }
  };

  for (const child of el.children) {
    child.parentElement = el;
  }

  return el;
}

global.Element = function() {};
global.window = {
  getComputedStyle: (el) => ({
    display: el.attributes['style-display'] || 'block',
    visibility: el.attributes['style-visibility'] || 'visible',
    opacity: '1'
  })
};

// Case A: 0 mutual connections -> Skipped
const btn1 = createMockElement('button', { className: 'artdeco-button', text: 'Connect' });
const card1 = createMockElement('div', {
  className: 'discover-person-card artdeco-card',
  children: [
    createMockElement('span', { className: 'discover-person-card__name', text: 'Rahul Sharma' }),
    createMockElement('span', { className: 'discover-person-card__mutual-connections', text: '0 mutual connections' }),
    btn1
  ]
});
btn1.parentElement = card1;

// Case B: 4 mutual connections -> Qualified
const btn2 = createMockElement('button', { className: 'artdeco-button', text: 'Connect' });
const card2 = createMockElement('div', {
  className: 'discover-person-card artdeco-card',
  children: [
    createMockElement('span', { className: 'discover-person-card__name', text: 'Arjun Kumar' }),
    createMockElement('span', { className: 'discover-person-card__mutual-connections', text: '4 mutual connections' }),
    btn2
  ]
});
btn2.parentElement = card2;

const mockDoc = createMockElement('div', {
  children: [card1, card2]
});

const scanResults = Detector.scanProfiles(mockDoc);
assert.strictEqual(scanResults.qualifiedCandidates.length, 1);
assert.strictEqual(scanResults.qualifiedCandidates[0].metadata.name, 'Arjun Kumar');
assert.strictEqual(scanResults.qualifiedCandidates[0].metadata.mutualConnections, 4);
assert.strictEqual(scanResults.skippedCandidates.length, 1);
console.log('✅ Mutual connection qualification filter verified.\n');

// 4. Test Zero-Reset on New Session
console.log('4. Testing Counter Reset to 0/100 on New Session...');
const { SessionStateManager } = require('./shared/session-state.js');
const manager = new SessionStateManager();

// Simulate previous session having 45 sent requests
manager.state.sentCount = 45;
manager.state.skippedCount = 12;
manager.state.errorCount = 2;

// User starts new session -> must reset all counters to 0
manager.startSession(true);
assert.strictEqual(manager.state.sentCount, 0, 'New session must start from 0 sent requests');
assert.strictEqual(manager.state.skippedCount, 0, 'New session must reset skipped count to 0');
assert.strictEqual(manager.state.errorCount, 0, 'New session must reset error count to 0');
assert.strictEqual(manager.state.status, Constants.STATES.SCANNING);
console.log('✅ Counter correctly resets to 0/100 on every new session start.\n');

// 5. Test Automated Send Progression & Cooldown
console.log('5. Testing Automated Send Progression & 5s Cooldown...');
manager.recordVerifiedRequest(scanResults.qualifiedCandidates[0].metadata);
assert.strictEqual(manager.state.sentCount, 1);
assert.strictEqual(manager.state.status, Constants.STATES.DELAYING);
assert.strictEqual(manager.state.countdownSeconds, 5);

manager.updateCountdown(4);
assert.strictEqual(manager.state.countdownSeconds, 4);

manager.updateCountdown(0);
assert.strictEqual(manager.state.status, Constants.STATES.SCANNING);
console.log('✅ Automated send increments counter and runs 5s countdown cooldown.\n');

// 6. Test Hard Session Limit (100)
console.log('6. Testing 100/100 Hard Limit Ceiling...');
manager.state.sentCount = 99;
manager.recordVerifiedRequest(scanResults.qualifiedCandidates[0].metadata);
assert.strictEqual(manager.state.sentCount, 100);
assert.strictEqual(manager.state.status, Constants.STATES.LIMIT_REACHED);
console.log('✅ Hard limit (100/100) strictly locks session.\n');

console.log('🎉 ALL AUTOMATED & ZERO-RESET INTEGRITY TESTS PASSED SUCCESSFULLY!');
