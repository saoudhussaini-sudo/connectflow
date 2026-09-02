/**
 * ConnectFlow - LinkedIn DOM Detection & Mutual Connection Qualification Module
 * Resilient multi-strategy Connect button discovery, robust mutual connection parser,
 * and strict profile qualification pipeline.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ConnectFlowLinkedInDetector = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let profileCounter = 0;

  /**
   * Universal DOM element visibility check
   */
  function isVisible(element) {
    if (!element || (element.nodeType !== 1 && !(typeof Element !== 'undefined' && element instanceof Element))) {
      return false;
    }

    try {
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
      }
    } catch (e) {}

    try {
      if (typeof element.getBoundingClientRect === 'function') {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0 && element.offsetWidth <= 0 && element.offsetHeight <= 0) {
          return false;
        }
      }
    } catch (e) {}

    return true;
  }

  /**
   * Normalizes text by removing extra spaces, newlines, and lowercasing
   */
  function normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Inspects rendered profile card for visible mutual connection count.
   * Returns:
   *   - positive integer (e.g. 1, 5, 12)
   *   - 0 (explicitly 0 or no mutuals)
   *   - null (if mutual info cannot be confidently detected — UNKNOWN = NOT QUALIFIED)
   */
  function getMutualConnectionCount(profileCard) {
    if (!profileCard || profileCard.nodeType !== 1) return null;

    // Search common containers for mutuals
    const mutualSelectors = [
      '.discover-person-card__mutual-connections',
      '.mn-discovery-person-card__mutual-connections',
      '.entity-result__simple-insight',
      '.entity-result__insight-text',
      '.entity-result__insights',
      '.member-insights',
      'span.text-body-xsmall',
      'div[class*="mutual"]',
      'span[class*="mutual"]',
      'p[class*="mutual"]'
    ];

    let fullCardText = normalizeText(profileCard.textContent || '');

    // Check specific selectors first
    for (const sel of mutualSelectors) {
      try {
        const els = profileCard.querySelectorAll(sel);
        for (const el of els) {
          const t = normalizeText(el.textContent || '');
          const count = parseMutualNumber(t);
          if (count !== null) return count;
        }
      } catch (e) {}
    }

    // Fallback: parse entire card text
    return parseMutualNumber(fullCardText);
  }

  /**
   * Helper to parse integer count from text snippet
   */
  function parseMutualNumber(text) {
    if (!text) return null;

    // Explicit 0 / no mutuals
    if (text.includes('no mutual connection') || text.includes('0 mutual connection')) {
      return 0;
    }

    // Pattern 1: "X and 12 other mutual connections" -> 12 + 1 = 13 or at least 12
    const otherMatch = text.match(/(?:and\s+)?(\d+)\s+other\s+mutual\s+connections?/i);
    if (otherMatch && otherMatch[1]) {
      const num = parseInt(otherMatch[1], 10);
      return !isNaN(num) ? num + 1 : null;
    }

    // Pattern 2: "1 mutual connection", "5 mutual connections"
    const match = text.match(/(\d+)\s+mutual\s+connections?/i);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      return !isNaN(num) ? num : null;
    }

    // Pattern 3: "3 mutuals", "1 mutual"
    const shortMatch = text.match(/(\d+)\s+mutuals?(?:\s|$|\.|\,)/i);
    if (shortMatch && shortMatch[1]) {
      const num = parseInt(shortMatch[1], 10);
      return !isNaN(num) ? num : null;
    }

    // Pattern 4: "1 connection in common", "4 connections in common"
    const commonMatch = text.match(/(\d+)\s+connections?\s+in\s+common/i);
    if (commonMatch && commonMatch[1]) {
      const num = parseInt(commonMatch[1], 10);
      return !isNaN(num) ? num : null;
    }

    return null;
  }

  /**
   * Classifies a DOM button into Connect / Pending / Message / Follow
   */
  function classifyButton(button) {
    if (!button || button.disabled) {
      return { status: 'DISABLED_OR_NULL', isEligible: false };
    }

    if (!isVisible(button)) {
      return { status: 'NOT_VISIBLE', isEligible: false };
    }

    const ariaLabel = normalizeText(button.getAttribute('aria-label') || '');
    const textContent = normalizeText(button.textContent || '');
    const innerSpans = Array.from(button.querySelectorAll('span, div, p'))
      .map(s => normalizeText(s.textContent || ''))
      .join(' ');
    
    const combined = `${ariaLabel} ${textContent} ${innerSpans}`;

    // 1. Pending checks
    if (
      combined.includes('pending') ||
      combined.includes('invitation sent') ||
      combined.includes('withdraw') ||
      combined.includes('requested')
    ) {
      return { status: 'PENDING', isEligible: false };
    }

    // 2. Already Connected / Message checks
    if (
      (combined.includes('message') || combined.includes('send inmail') || combined.includes('1st')) &&
      !combined.includes('connect')
    ) {
      return { status: 'MESSAGE', isEligible: false };
    }

    // 3. Following / Follow checks
    if (combined.includes('following') && !combined.includes('connect')) {
      return { status: 'FOLLOWING', isEligible: false };
    }

    if (combined.includes('follow') && !combined.includes('connect') && !ariaLabel.includes('invite')) {
      return { status: 'FOLLOW', isEligible: false };
    }

    // 4. Genuine Connect Action Checks
    const hasPlainConnect = 
      textContent === 'connect' || 
      innerSpans.split(' ').some(w => w === 'connect') ||
      textContent.split('\n').some(line => normalizeText(line) === 'connect');

    const hasInviteConnect = 
      (ariaLabel.includes('invite') && ariaLabel.includes('connect')) ||
      ariaLabel.startsWith('invite ') ||
      ariaLabel.startsWith('connect with') ||
      ariaLabel.includes('connect with') ||
      ariaLabel.endsWith('to connect');

    const hasConnectKeyword = 
      (textContent.includes('connect') || ariaLabel.includes('connect')) && 
      !combined.includes('remove connection') &&
      !combined.includes('connection request sent');

    if (hasPlainConnect || hasInviteConnect || hasConnectKeyword) {
      return { status: 'CONNECT_AVAILABLE', isEligible: true };
    }

    return { status: 'OTHER', isEligible: false };
  }

  /**
   * Finds the closest profile container card
   */
  function findCardContainer(button) {
    if (!button) return null;

    const cardSelectors = [
      '.discover-person-card',
      '.mn-discovery-person-card',
      '.entity-result__item',
      '.reusable-search__result-container',
      'li.grid__col--4-of-12',
      '.artdeco-card',
      '.mn-invitation-card',
      'div[data-chameleon-result-urn]',
      'li.reusable-search__result-container',
      '.pv-top-card',
      '.org-people-profile-card__profile-card-spacing',
      'li.artdeco-list__item',
      'li'
    ];

    for (const selector of cardSelectors) {
      try {
        const card = button.closest(selector);
        if (card) return card;
      } catch (e) {}
    }

    return button.parentElement?.parentElement || button.parentElement || button;
  }

  /**
   * Extracts profile metadata (Name, Headline, URL, Unique Key, Mutuals)
   */
  function extractProfileMetadata(card, button) {
    let name = '';
    let headline = 'Professional on LinkedIn';
    let profileKey = '';

    // 1. Try extracting name from button aria-label
    if (button && button.getAttribute('aria-label')) {
      const aria = button.getAttribute('aria-label');
      const match = 
        aria.match(/invite\s+(.+?)\s+to connect/i) || 
        aria.match(/connect with\s+(.+)/i) ||
        aria.match(/invite\s+(.+)/i);
      if (match && match[1]) {
        name = match[1].replace(/•\s*(1st|2nd|3rd\+?)/gi, '').trim();
      }
    }

    // 2. Try extracting from card selectors
    if (!name && card) {
      const nameSelectors = [
        '.discover-person-card__name',
        '.mn-discovery-person-card__name',
        '.entity-result__title-text a span[aria-hidden="true"]',
        '.entity-result__title-text a',
        '.actor-name',
        '.artdeco-entity-lockup__title',
        'span.hoverable-link-text',
        'h1.text-heading-xlarge',
        '.org-people-profile-card__profile-title',
        'a[href*="/in/"] span',
        'strong',
        'h3'
      ];

      for (const sel of nameSelectors) {
        try {
          const el = card.querySelector(sel);
          if (el) {
            const raw = (el.innerText || el.textContent || '').trim();
            const cleaned = raw.split('\n')[0].replace(/•\s*(1st|2nd|3rd\+?)/gi, '').trim();
            if (cleaned.length > 0) {
              name = cleaned;
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (!name) {
      name = 'LinkedIn Member';
    }

    // Extract Headline
    if (card) {
      const headlineSelectors = [
        '.discover-person-card__occupation',
        '.mn-discovery-person-card__occupation',
        '.entity-result__primary-subtitle',
        '.artdeco-entity-lockup__subtitle',
        '.text-body-medium.break-words',
        '.entity-result__summary',
        '.org-people-profile-card__profile-headline',
        '.artdeco-entity-lockup__caption'
      ];

      for (const sel of headlineSelectors) {
        try {
          const el = card.querySelector(sel);
          if (el) {
            const hText = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
            if (hText.length > 0) {
              headline = hText;
              break;
            }
          }
        } catch (e) {}
      }
    }

    // Extract Profile URL / Handle
    if (card) {
      try {
        const linkEl = card.querySelector('a[href*="/in/"]');
        if (linkEl && linkEl.getAttribute('href')) {
          const href = linkEl.getAttribute('href');
          const match = href.match(/\/in\/([^/?#]+)/);
          if (match && match[1]) {
            profileKey = match[1].toLowerCase().trim();
          }
        }
      } catch (e) {}
    }

    // Fallback Unique Key
    if (!profileKey) {
      if (name && name !== 'LinkedIn Member') {
        profileKey = `${normalizeText(name)}_${normalizeText(headline).slice(0, 20)}`;
      } else {
        profileCounter++;
        profileKey = `prof_${Date.now()}_${profileCounter}`;
      }
    }

    // Extract Mutual Connections Count
    const mutualConnections = getMutualConnectionCount(card);

    return {
      id: profileKey,
      profileKey,
      name,
      headline,
      mutualConnections,
      hasMutuals: mutualConnections !== null && mutualConnections >= 1,
      status: 'CONNECT_AVAILABLE'
    };
  }

  /**
   * Scans and qualifies profile cards on page
   */
  function scanProfiles(rootNode = document) {
    let allButtons = [];

    try {
      allButtons = Array.from(rootNode.querySelectorAll('button, a.artdeco-button, [role="button"]'));
    } catch (e) {
      allButtons = [];
    }

    if (rootNode.tagName === 'BUTTON' || rootNode.getAttribute?.('role') === 'button') {
      if (!allButtons.includes(rootNode)) allButtons.unshift(rootNode);
    }

    const cardsSeen = new Set();
    const results = {
      totalButtons: allButtons.length,
      connectButtonsCount: 0,
      profileCardsCount: 0,
      profilesWithMutuals: 0,
      profilesWithoutMutuals: 0,
      qualifiedCandidates: [],
      skippedCandidates: []
    };

    for (const btn of allButtons) {
      const classification = classifyButton(btn);
      const card = findCardContainer(btn);

      if (card && !cardsSeen.has(card)) {
        cardsSeen.add(card);
        results.profileCardsCount++;
      }

      if (classification.isEligible) {
        results.connectButtonsCount++;
        const metadata = extractProfileMetadata(card, btn);

        if (metadata.hasMutuals) {
          results.profilesWithMutuals++;
          results.qualifiedCandidates.push({
            element: btn,
            cardElement: card,
            metadata,
            classification,
            isQualified: true
          });
        } else {
          results.profilesWithoutMutuals++;
          const reason = metadata.mutualConnections === 0 
            ? '0 mutual connections' 
            : 'No mutual connections detected';
          
          results.skippedCandidates.push({
            element: btn,
            cardElement: card,
            metadata,
            classification,
            isQualified: false,
            skipReason: reason
          });
        }
      } else if (card) {
        // Non-connect buttons (Follow / Pending / Message)
        const metadata = extractProfileMetadata(card, btn);
        const reason = classification.status === 'PENDING' 
          ? 'Pending invitation'
          : classification.status === 'FOLLOW' || classification.status === 'FOLLOWING'
          ? 'Follow only'
          : 'Connect unavailable';

        results.skippedCandidates.push({
          element: btn,
          cardElement: card,
          metadata,
          classification,
          isQualified: false,
          skipReason: reason
        });
      }
    }

    return results;
  }

  return {
    isVisible,
    normalizeText,
    getMutualConnectionCount,
    classifyButton,
    findCardContainer,
    extractProfileMetadata,
    scanProfiles
  };
});
