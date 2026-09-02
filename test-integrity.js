/**
 * ConnectFlow - Automated Verification & Scanner Integrity Test Suite
 * Tests all 10 Qualification, Watchdog, Ceiling and Cooldown Test Cases
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting ConnectFlow Qualification & Integrity Test Suite...\n');

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
console.log('3. Testing LinkedIn Detector & Mutual Connection Filter (Cases 1 - 6)...');
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
          const matchP = selector.includes('p') && child.tagName === 'P';

          if (matchBtn || matchA || matchSpan || matchDiv || matchP) {
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

// CASE 1: Profile: Connect available, 0 mutual connections -> SKIPPED
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

// CASE 2: Profile: Connect available, 1 mutual connection -> QUALIFIED
const btn2 = createMockElement('button', { className: 'artdeco-button', text: 'Connect' });
const card2 = createMockElement('div', {
  className: 'discover-person-card artdeco-card',
  children: [
    createMockElement('span', { className: 'discover-person-card__name', text: 'Elena Rostova' }),
    createMockElement('span', { className: 'discover-person-card__mutual-connections', text: '1 mutual connection' }),
    btn2
  ]
});
btn2.parentElement = card2;

// CASE 3: Profile: Connect available, 8 mutual connections -> QUALIFIED
const btn3 = createMockElement('button', { className: 'artdeco-button', text: 'Connect' });
const card3 = createMockElement('div', {
  className: 'discover-person-card artdeco-card',
  children: [
    createMockElement('span', { className: 'discover-person-card__name', text: 'Arjun Kumar' }),
    createMockElement('span', { className: 'discover-person-card__mutual-connections', text: '8 mutual connections' }),
    btn3
  ]
});
btn3.parentElement = card3;

// CASE 4: Profile: Follow available, 5 mutual connections -> SKIPPED
const btn4 = createMockElement('button', { className: 'artdeco-button', text: 'Follow' });
const card4 = createMockElement('div', {
  className: 'discover-person-card artdeco-card',
  children: [
    createMockElement('span', { className: 'discover-person-card__name', text: 'Priya Singh' }),
    createMockElement('span', { className: 'discover-person-card__mutual-connections', text: '5 mutual connections' }),
    btn4
  ]
});
btn4.parentElement = card4;

// CASE 5: Profile: Pending, 5 mutual connections -> SKIPPED
const btn5 = createMockElement('button', { className: 'artdeco-button', text: 'Pending' });
const card5 = createMockElement('div', {
  className: 'discover-person-card artdeco-card',
  children: [
    createMockElement('span', { className: 'discover-person-card__name', text: 'David Miller' }),
    createMockElement('span', { className: 'discover-person-card__mutual-connections', text: '5 mutual connections' }),
    btn5
  ]
});
btn5.parentElement = card5;

// CASE 6: Mutual connection text cannot be detected (null) -> SKIPPED / UNKNOWN
const btn6 = createMockElement('button', { className: 'artdeco-button', text: 'Connect' });
const card6 = createMockElement('div', {
  className: 'discover-person-card artdeco-card',
  children: [
    createMockElement('span', { className: 'discover-person-card__name', text: 'Anonymous Candidate' }),
    btn6
  ]
});
btn6.parentElement = card6;

const mockDoc = createMockElement('div', {
  children: [card1, card2, card3, card4, card5, card6]
});

const scanResults = Detector.scanProfiles(mockDoc);

assert.strictEqual(scanResults.qualifiedCandidates.length, 2, 'Only Case 2 (1 mutual) and Case 3 (8 mutuals) must qualify');
assert.strictEqual(scanResults.qualifiedCandidates[0].metadata.name, 'Elena Rostova');
assert.strictEqual(scanResults.qualifiedCandidates[0].metadata.mutualConnections, 1);
assert.strictEqual(scanResults.qualifiedCandidates[1].metadata.name, 'Arjun Kumar');
assert.strictEqual(scanResults.qualifiedCandidates[1].metadata.mutualConnections, 8);

assert.strictEqual(Detector.getMutualConnectionCount(card1), 0, 'Case 1 must return 0 mutual connections');
assert.strictEqual(Detector.getMutualConnectionCount(card6), null, 'Case 6 must return null (unknown = not qualified)');

console.log('✅ CASE 1-6 Passed: Mutual connection filtering accurately qualifies only Connect buttons with >= 1 mutuals.\n');

// 4. Test Session State Machine & Hard Limits (Cases 7 - 10)
console.log('4. Testing Session State & Hard Limits (Cases 7 - 10)...');
const { SessionStateManager } = require('./shared/session-state.js');
const manager = new SessionStateManager();

// CASE 7: 98 / 100 -> Continue processing
manager.state.sentCount = 98;
manager.startSession();
assert.strictEqual(manager.state.status, Constants.STATES.SCANNING);
console.log('✅ CASE 7 Passed: At 98/100, session starts and continues processing.');

// CASE 8: 99 / 100 -> One final confirmed request permitted
manager.state.sentCount = 99;
manager.recordVerifiedRequest(scanResults.qualifiedCandidates[1].metadata);
assert.strictEqual(manager.state.sentCount, 100);
assert.strictEqual(manager.state.status, Constants.STATES.LIMIT_REACHED);
console.log('✅ CASE 8 Passed: 99/100 advances to 100/100 and transitions to LIMIT_REACHED.');

// CASE 9: 100 / 100 -> STOPPED — LIMIT REACHED
manager.startSession();
assert.strictEqual(manager.state.status, Constants.STATES.LIMIT_REACHED, 'At 100/100, session cannot restart without reset');
console.log('✅ CASE 9 Passed: 100/100 strictly locks further scans.');

// CASE 10: User presses STOP during 5-second delay -> Timer cancelled immediately
manager.state.sentCount = 50;
manager.state.status = Constants.STATES.DELAYING;
manager.state.countdownSeconds = 4;
manager.stopSession();
assert.strictEqual(manager.state.status, Constants.STATES.STOPPED);
assert.strictEqual(manager.state.countdownSeconds, 0);
console.log('✅ CASE 10 Passed: STOP immediately halts countdown delay.');

console.log('\n🎉 ALL 10 INTEGRITY & QUALIFICATION TEST CASES PASSED SUCCESSFULLY!');
