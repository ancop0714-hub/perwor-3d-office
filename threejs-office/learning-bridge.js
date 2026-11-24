/*
 * Perwor Phase 1 API bridge.
 *
 * This file intentionally contains no learning state of its own. The server
 * remains the source of truth for authentication, article selection, progress,
 * review scheduling, and result persistence.
 */
(function attachPerworLearningBridge(global) {
  'use strict';

  const DEFAULT_API_BASE = '';

  function trimTrailingSlash(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function configuredApiBase() {
    const fromGlobal = global.__PERWOR_API_BASE__;
    if (fromGlobal) return trimTrailingSlash(fromGlobal);
    try {
      const fromQuery = new URLSearchParams(global.location.search).get('apiBase');
      if (fromQuery) return trimTrailingSlash(fromQuery);
    } catch {}
    return DEFAULT_API_BASE;
  }

  function readJson(text) {
    try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
  }

  class PerworLearningBridge {
    constructor(options = {}) {
      this.apiBase = trimTrailingSlash(options.apiBase ?? configuredApiBase());
      this.baseOrigin = this.apiBase ? new URL(this.apiBase, global.location.href).origin : global.location.origin;
      this.sameOrigin = this.baseOrigin === global.location.origin;
      this.lastRequest = null;
    }

    url(path) {
      return new URL(path, this.apiBase ? `${this.apiBase}/` : global.location.origin + '/').toString();
    }

    async request(path, options = {}) {
      const url = this.url(path);
      const headers = new Headers(options.headers || {});
      headers.set('Accept', 'application/json');
      if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      this.lastRequest = { method: options.method || 'GET', url };
      const controller = new AbortController();
      const timeoutId = global.setTimeout(() => controller.abort(), 20000);
      let response;
      try {
        response = await fetch(url, {
          ...options,
          headers,
          signal: options.signal || controller.signal,
          cache: 'no-store',
          // Auth cookies are only sent when the page and API are the same origin.
          // We never copy credentials into query strings or local storage.
          credentials: this.sameOrigin ? 'include' : 'omit',
        });
      } finally {
        global.clearTimeout(timeoutId);
      }
      const payload = readJson(await response.text());
      if (!response.ok) {
        const error = new Error(payload?.error || `Perwor API ${response.status}`);
        error.status = response.status;
        error.payload = payload;
        error.url = url;
        throw error;
      }
      return payload;
    }

    async getMe() {
      try {
        return await this.request('/api/me');
      } catch (error) {
        if (error.status === 401) return { authenticated: false };
        throw error;
      }
    }

    async getLearning() {
      try {
        return await this.request('/api/learning');
      } catch (error) {
        if (error.status === 401) return { authenticated: false };
        throw error;
      }
    }

    async getTypingContent() {
      return this.request('/api/typing-content');
    }

    async saveTypingResult({ article, answerText, metrics, timezone }) {
      if (!article?.sentenceId || !article?.text) {
        throw new Error('타이핑 콘텐츠에 sentenceId 또는 text가 없습니다.');
      }
      const payload = {
        sentenceId: article.sentenceId,
        english: article.text,
        // Store only the translation for this exact passage. Never use the
        // article summary or title as a fake Korean translation.
        korean: article.translationKo || '',
        category: article.category || '보고서·문서',
        source: 'typing',
        score: Number(metrics?.accuracy) || 0,
        answerText: answerText || '',
        articleTitle: article.title || '',
        articleSource: article.source || '',
        articleUrl: article.url || '',
        articlePublishedAt: article.publishedAt || '',
        completedAt: new Date().toISOString(),
        timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
        // These are harmless extra fields for forward-compatible API versions;
        // the current route ignores unknown fields and persists the known ones.
        typingWpm: Number(metrics?.wpm) || 0,
        typingAccuracy: Number(metrics?.accuracy) || 0,
        typingErrors: Number(metrics?.errors) || 0,
        typingElapsedSeconds: Number(metrics?.elapsedSeconds) || 0,
      };
      return this.request('/api/learning', {
        method: 'POST',
        headers: { 'x-perwor-timezone': payload.timezone },
        body: JSON.stringify(payload),
      });
    }

    async saveSpeakingResult({ sentence, answerText, feedback, timezone }) {
      if (!sentence?.sentenceId || !sentence?.english || !sentence?.korean) {
        throw new Error('말하기 문장에 sentenceId, english, korean이 필요합니다.');
      }
      const payload = {
        sentenceId: sentence.sentenceId,
        english: sentence.english,
        korean: sentence.korean,
        category: sentence.category || '기타',
        source: 'speaking',
        score: Number(feedback?.totalScore) || 0,
        answerText: answerText || '',
        recommendedEnglish: sentence.english,
        feedbackKo: feedback?.feedbackKo || '',
        meaningScore: feedback?.meaningScore,
        grammarScore: feedback?.grammarScore,
        vocabularyScore: feedback?.vocabularyScore,
        fluencyScore: feedback?.fluencyScore,
        pronunciationScore: feedback?.pronunciationScore,
        confusedTerms: feedback?.confusedExpressions || [],
        evidence: feedback?.evidence || [],
        needsReview: Boolean(feedback?.needsReview),
        answerConfirmed: true,
        feedbackCompleted: true,
        timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
      };
      return this.request('/api/learning', {
        method: 'POST',
        headers: { 'x-perwor-timezone': payload.timezone },
        body: JSON.stringify(payload),
      });
    }
  }

  global.PerworLearningBridge = PerworLearningBridge;
})(window);
