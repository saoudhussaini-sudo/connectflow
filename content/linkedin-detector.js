/**
 * ConnectFlow - LinkedIn DOM Detection Module
 * Resilient multi-strategy Connect button discovery, robust visibility checks,
 * comprehensive text normalization, and reliable profile card association.
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
   * Robust element visibility check
   */
  function isVisible(element) {
    if (!element || (element.nodeType !== 1 && !(typeof Element !== 'undefined' && element instanceof Element))) {
      return false;
    }

    // Check inline or computed styles
    try {
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
      }
    } catch (e) {}

    // Bounding rectangle check
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
   * Normalizes text by removing non-alphanumeric noise, lowercasing, and collapsing whitespace
   */
  function normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Classifies any DOM button or clickable element into Connect / Pending / Message / Follow
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

    // 3. Following / Follow checks (only if not an invite/connect)
    if (combined.includes('following') && !combined.includes('connect')) {
      return { status: 'FOLLOWING', isEligible: false };
    }

    if (combined.includes('follow') && !combined.includes('connect') && !ariaLabel.includes('invite')) {
      return { status: 'FOLLOW', isEligible: false };
    }

    // 4. Genuine Connect Action Checks
    // A. Plain "connect"
    const hasPlainConnect = 
      textContent === 'connect' || 
      innerSpans.split(' ').some(w => w === 'connect') ||
      textContent.split('\n').some(line => normalizeText(line) === 'connect');

    // B. "Invite ... to connect"
    const hasInviteConnect = 
      ariaLabel.includes('invite') && ariaLabel.includes('connect') ||
      ariaLabel.startsWith('invite ') ||
      ariaLabel.startsWith('connect with') ||
      ariaLabel.includes('connect with') ||
      ariaLabel.endsWith('to connect');

    // C. Text contains "connect" without "remove connection" or "message"
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
   * Extracts profile metadata (Name, Headline, URL, Unique Key)
   */
  function extractProfileMetadata(card, button) {
    let name = '';
    let headline = 'Professional on LinkedIn';
    let avatarUrl = '';
    let profileKey = '';

    // 1. Try extracting name from button aria-label: "Invite Alex Johnson to connect"
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

    // Extract Profile URL / Unique Handle
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

    // Fallback Unique Key: combine name and unique sequence
    if (!profileKey) {
      if (name && name !== 'LinkedIn Member') {
        profileKey = `${normalizeText(name)}_${normalizeText(headline).slice(0, 20)}`;
      } else {
        profileCounter++;
        profileKey = `prof_${Date.now()}_${profileCounter}`;
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

  /**
   * Discovers all Connect buttons on page using multi-strategy query
   */
  function findConnectButtons(rootNode = document) {
    let allButtons = [];

    try {
      allButtons = Array.from(rootNode.querySelectorAll('button, a.artdeco-button, [role="button"]'));
    } catch (e) {
      allButtons = [];
    }

    // Also include rootNode if it is itself a button
    if (rootNode.tagName === 'BUTTON' || rootNode.getAttribute?.('role') === 'button') {
      if (!allButtons.includes(rootNode)) allButtons.unshift(rootNode);
    }

    const totalButtons = allButtons.length;
    const candidates = [];
    let eligibleCount = 0;

    for (const btn of allButtons) {
      const classification = classifyButton(btn);

      if (classification.isEligible) {
        eligibleCount++;
        const card = findCardContainer(btn);
        const metadata = extractProfileMetadata(card, btn);

        candidates.push({
          element: btn,
          cardElement: card,
          metadata,
          classification
        });
      }
    }

    return {
      totalFound: totalButtons,
      eligibleCount,
      candidates
    };
  }

  return {
    isVisible,
    normalizeText,
    classifyButton,
    findCardContainer,
    extractProfileMetadata,
    findConnectButtons
  };
});
