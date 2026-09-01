/**
 * ConnectFlow - Automated Verification & Scanner Integrity Test Suite
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting ConnectFlow Scanner & Integrity Test Suite...\n');

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
assert.strictEqual(Constants.LOOP_INTERVAL_MS, 5000);
console.log('✅ Constants verified.\n');

// 3. Test LinkedIn Detector Multi-Strategy Discovery
console.log('3. Testing LinkedIn Detector multi-strategy discovery & text normalization...');
const Detector = require('./content/linkedin-detector.js');

// Mock DOM elements simulating real LinkedIn /mynetwork/grow/ and search cards
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

// Global window mock for test environment
global.Element = function() {};
global.window = {
  getComputedStyle: (el) => ({
    display: el.attributes['style-display'] || 'block',
    visibility: el.attributes['style-visibility'] || 'visible',
    opacity: '1'
  })
};

// Test Case A: Plain "Connect" button inside span
const btnSpan = createMockElement('span', { text: 'Connect' });
const btn1 = createMockElement('button', {
  className: 'artdeco-button artdeco-button--secondary',
  children: [btnSpan],
  text: 'Connect'
});

const card1 = createMockElement('div', {
  className: 'discover-person-card artdeco-card',
  children: [
    createMockElement('span', { className: 'discover-person-card__name', text: 'Ashok Vallem' }),
    createMockElement('span', { className: 'discover-person-card__occupation', text: 'Lead Data Engineer' }),
    btn1
  ]
});
btn1.parentElement = card1;

// Test Case B: Aria-label "Invite Sarah Connor to connect"
const btn2 = createMockElement('button', {
  className: 'artdeco-button',
  attributes: { 'aria-label': 'Invite Sarah Connor to connect' },
  text: 'Connect'
});
const card2 = createMockElement('div', {
  className: 'entity-result__item',
  children: [
    createMockElement('span', { className: 'entity-result__title-text', text: 'Sarah Connor' }),
    btn2
  ]
});
btn2.parentElement = card2;

// Test Case C: "Message" button (must NOT be eligible)
const btn3 = createMockElement('button', {
  className: 'artdeco-button',
  text: 'Message',
  attributes: { 'aria-label': 'Message John Doe' }
});

// Test Case D: "Pending" button (must NOT be eligible)
const btn4 = createMockElement('button', {
  className: 'artdeco-button',
  text: 'Pending',
  attributes: { 'aria-label': 'Pending invitation' }
});

const mockDoc = createMockElement('div', {
  children: [card1, card2, btn3, btn4]
});

const result = Detector.findConnectButtons(mockDoc);

assert.strictEqual(result.eligibleCount, 2, 'Must detect exactly 2 eligible connect buttons');
assert.strictEqual(result.candidates[0].metadata.name, 'Ashok Vallem');
assert.strictEqual(result.candidates[1].metadata.name, 'Sarah Connor');
assert.notStrictEqual(result.candidates[0].metadata.profileKey, result.candidates[1].metadata.profileKey, 'Profile keys must be distinct');

console.log('✅ findConnectButtons correctly identified all eligible Connect buttons and distinguished from Pending/Message.\n');

// 4. Test State Machine
console.log('4. Testing Session State Manager transitions...');
const { SessionStateManager } = require('./shared/session-state.js');
const manager = new SessionStateManager();

manager.startSession();
assert.strictEqual(manager.state.status, Constants.STATES.SCANNING);

manager.setDetectedProfile(result.candidates[0].metadata);
assert.strictEqual(manager.state.status, Constants.STATES.PROFILE_FOUND);
assert.strictEqual(manager.state.currentProfile.name, 'Ashok Vallem');

manager.recordVerifiedRequest(result.candidates[0].metadata);
assert.strictEqual(manager.state.sentCount, 1);
assert.strictEqual(manager.state.status, Constants.STATES.WAITING_DELAY);

console.log('✅ State transitions work correctly without getting stuck.\n');
console.log('🎉 ALL SCANNER INTEGRITY TESTS PASSED SUCCESSFULLY!');
