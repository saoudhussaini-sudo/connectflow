/**
 * ConnectFlow - LinkedIn DOM Detection Module
 * Robust selector heuristics, deduplication key generator, and button classifier.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ConnectFlowLinkedInDetector = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SELECTORS = {
    profileCards: [
      '.entity-result__item',
      '.reusable-search__result-container',
      '.discover-person-card',
      '.mn-discovery-person-card',
      'li.grid__col--4-of-12',
      '.artdeco-card',
      '.mn-invitation-card',
      'div[data-chameleon-result-urn]',
      'li.reusable-search__result-container',
      '.pv-top-card',
      '.org-people-profile-card__profile-card-spacing'
    ],

    buttons: [
      'button[aria-label*="Invite"]',
      'button[aria-label*="Connect"]',
      'button[aria-label*="connect"]',
      '.artdeco-button--secondary',
      '.artdeco-button--primary',
      'button.artdeco-button',
      '.pvs-profile-actions button'
    ],

    names: [
      '.entity-result__title-text a span[aria-hidden="true"]',
      '.entity-result__title-text a',
      '.discover-person-card__name',
      '.mn-discovery-person-card__name',
      '.actor-name',
      '.artdeco-entity-lockup__title',
      'span.hoverable-link-text',
      'h1.text-heading-xlarge',
      '.org-people-profile-card__profile-title'
    ],

    headlines: [
      '.entity-result__primary-subtitle',
      '.discover-person-card__occupation',
      '.mn-discovery-person-card__occupation',
      '.artdeco-entity-lockup__subtitle',
      '.text-body-medium.break-words',
      '.entity-result__summary',
      '.org-people-profile-card__profile-headline'
    ],

    profileLinks: [
      'a.app-aware-link[href*="/in/"]',
      '.entity-result__title-text a',
      '.discover-person-card__link',
      'a[href*="/in/"]'
    ],

    avatars: [
      '.presence-entity__image',
      '.discover-person-card__profile-image',
      '.mn-discovery-person-card__image',
      '.entity-result__universal-image img',
      '.pv-top-card-profile-picture__image',
      'img[data-delayed-url]'
    ]
  };

  function queryAny(scope, selectorArray) {
    if (!scope) return null;
    for (const selector of selectorArray) {
      try {
        const el = scope.querySelector(selector);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  }

  function queryAllAny(scope, selectorArray) {
    if (!scope) return [];
    const results = new Set();
    for (const selector of selectorArray) {
      try {
        const elements = scope.querySelectorAll(selector);
        elements.forEach(el => results.add(el));
      } catch (e) {}
    }
    return Array.from(results);
  }

  function classifyButton(button) {
    if (!button || button.disabled) {
      return { status: 'UNKNOWN', isEligible: false };
    }

    const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase().trim();
    const textContent = (button.textContent || '').toLowerCase().trim();
    const innerSpans = Array.from(button.querySelectorAll('span'))
      .map(s => (s.textContent || '').toLowerCase().trim())
      .join(' ');
    const combined = `${ariaLabel} ${textContent} ${innerSpans}`;

    // Pending checks
    if (
      combined.includes('pending') ||
      combined.includes('invitation sent') ||
      combined.includes('withdraw') ||
      combined.includes('requested')
    ) {
      return { status: 'PENDING', isEligible: false };
    }

    // Message / 1st Connection checks
    if (
      combined.includes('message') ||
      combined.includes('send inmail') ||
      combined.includes('1st') ||
      combined.includes('remove connection')
    ) {
      return { status: 'MESSAGE', isEligible: false };
    }

    // Following / Follow checks
    if (combined.includes('following')) {
      return { status: 'FOLLOWING', isEligible: false };
    }

    // Connect checks
    const isConnectText =
      textContent.split('\n').some(line => line.trim() === 'connect') ||
      innerSpans.split(' ').includes('connect') ||
      ariaLabel.startsWith('invite ') ||
      ariaLabel.includes('invite') && ariaLabel.includes('connect');

    if (isConnectText && !combined.includes('follow') && !combined.includes('message') && !combined.includes('pending')) {
      return { status: 'CONNECT_AVAILABLE', isEligible: true };
    }

    if (combined.includes('follow')) {
      return { status: 'FOLLOW', isEligible: false };
    }

    return { status: 'UNKNOWN', isEligible: false };
  }

  function findCardContainer(button) {
    if (!button) return null;

    for (const selector of SELECTORS.profileCards) {
      try {
        const card = button.closest(selector);
        if (card) return card;
      } catch (e) {}
    }

    let current = button.parentElement;
    for (let i = 0; i < 5 && current; i++) {
      if (
        current.classList.contains('entity-result') ||
        current.classList.contains('discover-person-card') ||
        current.classList.contains('artdeco-card') ||
        current.tagName === 'LI'
      ) {
        return current;
      }
      current = current.parentElement;
    }

    return button.parentElement || button;
  }

  function extractProfileMetadata(card, button) {
    let name = 'LinkedIn Member';
    let headline = 'Professional on LinkedIn';
    let avatarUrl = '';
    let profileKey = '';

    // Extract Name
    const nameEl = queryAny(card, SELECTORS.names);
    if (nameEl) {
      const raw = (nameEl.innerText || nameEl.textContent || '').trim();
      const cleaned = raw.split('\n')[0].replace(/•\s*(1st|2nd|3rd\+?)/gi, '').trim();
      if (cleaned.length > 0) name = cleaned;
    } else if (button && button.getAttribute('aria-label')) {
      const aria = button.getAttribute('aria-label');
      const match = aria.match(/invite\s+(.+?)\s+to connect/i) || aria.match(/connect with\s+(.+)/i);
      if (match && match[1]) name = match[1].trim();
    }

    // Extract Headline
    const headlineEl = queryAny(card, SELECTORS.headlines);
    if (headlineEl) {
      const hText = (headlineEl.innerText || headlineEl.textContent || '').trim().replace(/\s+/g, ' ');
      if (hText.length > 0) headline = hText;
    }

    // Extract Profile Unique Key (Preferred: URL handle)
    const linkEl = queryAny(card, SELECTORS.profileLinks);
    if (linkEl && linkEl.getAttribute('href')) {
      const href = linkEl.getAttribute('href');
      const match = href.match(/\/in\/([^/?#]+)/);
      if (match && match[1]) {
        profileKey = match[1].toLowerCase();
      }
    }

    if (!profileKey) {
      const urn = card.getAttribute('data-chameleon-result-urn') || card.getAttribute('data-urn');
      if (urn) {
        profileKey = urn;
      } else {
        profileKey = `${name.toLowerCase().trim()}_${headline.toLowerCase().trim().slice(0, 30)}`;
      }
    }

    return {
      id: profileKey,
      profileKey,
      name,
      headline,
      avatarUrl,
      status: 'CONNECT_AVAILABLE'
    };
  }

  function scanProfiles(rootNode = document) {
    const candidateButtons = queryAllAny(rootNode, SELECTORS.buttons);
    const eligibleList = [];

    for (const btn of candidateButtons) {
      if (!btn.offsetParent && btn.offsetWidth === 0 && btn.offsetHeight === 0) {
        continue;
      }

      const classification = classifyButton(btn);
      if (classification.isEligible) {
        const card = findCardContainer(btn);
        const metadata = extractProfileMetadata(card, btn);

        eligibleList.push({
          element: btn,
          cardElement: card,
          metadata
        });
      }
    }

    return eligibleList;
  }

  return {
    SELECTORS,
    classifyButton,
    findCardContainer,
    extractProfileMetadata,
    scanProfiles
  };
});
