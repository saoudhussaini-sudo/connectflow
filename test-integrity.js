/**
 * ConnectFlow - Automated Verification & Scanner Integrity Test Suite
 * Includes exact LinkedIn /mynetwork/grow/ card patterns with truncation
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting ConnectFlow Screenshot & Scanner Integrity Test Suite...\n');

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

// 3. Test LinkedIn Detector with exact Screenshot DOM examples
console.log('3. Testing LinkedIn Detector on Screenshot DOM variations...');
const Detector = require('./content/linkedin-detector.js');

function createCard(name, mutualText, buttonText = '+ Connect') {
  const card = {
    nodeType: 1,
    tagName: 'DIV',
    className: 'discover-person-card artdeco-card',
    textContent: `${name} ${mutualText} ${buttonText}`,
    attributes: {},
    children: [],
    getAttribute: (k) => null,
    querySelector: (sel) => {
      if (sel.includes('name')) return { innerText: name, textContent: name };
      return null;
    },
    querySelectorAll: () => [],
    closest: function(sel) { return this; },
    getBoundingClientRect: () => ({ width: 200, height: 280 })
  };

  const btn = {
    nodeType: 1,
    tagName: 'BUTTON',
    className: 'artdeco-button artdeco-button--secondary',
    textContent: buttonText,
    parentElement: card,
    attributes: {},
    getAttribute: (k) => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: function(sel) { return card; },
    getBoundingClientRect: () => ({ width: 120, height: 36 })
  };

  card.button = btn;
  return card;
}

// Screenshot Card 1: Pappoppula Akhilesh - "HARSHITHA and 19 other mutual ..."
const card1 = createCard('Pappoppula Akhilesh', 'HARSHITHA and 19 other mutual ...', '+ Connect');

// Screenshot Card 2: Ramya Sri Surya - "Syed Shah Abdul and 16 other mutual ..."
const card2 = createCard('Ramya Sri Surya', 'Syed Shah Abdul and 16 other mutual ...', '+ Connect');

// Screenshot Card 3: Rushi Lonare - "Lonare and 26 other mutual connections"
const card3 = createCard('Rushi Lonare', 'Lonare and 26 other mutual connections', '+ Connect');

// Negative Card: 0 mutual connections
const card4 = createCard('Zero Mutuals Candidate', '0 mutual connections', '+ Connect');

const mockDoc = {
  nodeType: 1,
  tagName: 'DIV',
  querySelectorAll: (sel) => [card1.button, card2.button, card3.button, card4.button]
};

const scanResults = Detector.scanProfiles(mockDoc);

assert.strictEqual(scanResults.qualifiedCandidates.length, 3, 'All 3 screenshot candidates with mutuals must qualify');
assert.strictEqual(scanResults.qualifiedCandidates[0].metadata.name, 'Pappoppula Akhilesh');
assert.ok(scanResults.qualifiedCandidates[0].metadata.mutualConnections >= 19);

assert.strictEqual(scanResults.qualifiedCandidates[1].metadata.name, 'Ramya Sri Surya');
assert.ok(scanResults.qualifiedCandidates[1].metadata.mutualConnections >= 16);

assert.strictEqual(scanResults.qualifiedCandidates[2].metadata.name, 'Rushi Lonare');
assert.ok(scanResults.qualifiedCandidates[2].metadata.mutualConnections >= 26);

assert.strictEqual(scanResults.skippedCandidates.length, 1);
console.log('✅ Screenshot test passed: All 3 visible cards from LinkedIn screenshot successfully qualified!\n');

// 4. Test Zero-Reset and Progression
console.log('4. Testing Session Zero-Reset & Automated Progression...');
const { SessionStateManager } = require('./shared/session-state.js');
const manager = new SessionStateManager();

manager.state.sentCount = 50;
manager.startSession(true);
assert.strictEqual(manager.state.sentCount, 0, 'Must reset sentCount to 0');
assert.strictEqual(manager.state.status, Constants.STATES.SCANNING);

manager.recordVerifiedRequest(scanResults.qualifiedCandidates[0].metadata);
assert.strictEqual(manager.state.sentCount, 1);
assert.strictEqual(manager.state.status, Constants.STATES.DELAYING);
assert.strictEqual(manager.state.countdownSeconds, 5);
console.log('✅ State transitions and cooldown verified.\n');

console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
