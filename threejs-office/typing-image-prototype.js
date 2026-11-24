(function attachPerworImageTypingPrototype(global) {
  'use strict';

  const bridge = new global.PerworLearningBridge();
  const dedicatedRoot = document.querySelector('[data-typing-dedicated]');
  const root = dedicatedRoot || document.querySelector('[data-image-stage]');
  const isDedicated = Boolean(dedicatedRoot);
  const query = selector => root?.querySelector(selector) || document.querySelector(selector);
  const stage = root;
  const monitorUi = isDedicated ? null : query('[data-monitor-ui]');
  const sourceEl = query('[data-typing-source]');
  const inputEl = query('[data-typing-input]');
  const completeButton = query('[data-typing-complete]');
  const loadingEl = query('[data-typing-loading]');
  const loadingMessageEl = query('[data-typing-loading-message]');
  const retryButton = query('[data-typing-retry]');
  const promptEl = query('[data-typing-prompt]');
  const resultEl = query('[data-typing-result]');
  const statusEl = query('[data-typing-status]');
  const activityEl = query('[data-typing-activity]');
  const wpmEl = query('[data-metric="wpm"]');
  const accuracyEl = query('[data-metric="accuracy"]');
  const errorsEl = query('[data-metric="errors"]');
  const elapsedEl = query('[data-metric="elapsed"]');
  const backButton = query('[data-back-office]');
  const returnTarget = backButton?.dataset.returnUrl || './phase1.html?scene=office';

  const monitorMap = {
    // Normalized coordinates from the 1536x1024 source reference image.
    left: 439 / 1536,
    top: 220 / 1024,
    width: 687 / 1536,
    height: 370 / 1024,
  };

  let article = null;
  let startedAt = 0;
  let timerId = null;
  let locked = false;
  let activityTimer = null;
  let focusTimer = null;
  let loadingRequestId = 0;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function formatTime(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function mapMonitorUi() {
    if (!monitorUi) return;
    monitorUi.style.left = `${monitorMap.left * 100}%`;
    monitorUi.style.top = `${monitorMap.top * 100}%`;
    monitorUi.style.width = `${monitorMap.width * 100}%`;
    monitorUi.style.height = `${monitorMap.height * 100}%`;
  }

  function resetFocusMode() {
    global.clearTimeout(focusTimer);
    focusTimer = null;
    if (stage) {
      stage.classList.remove('is-focused', 'is-intro');
      if (!isDedicated) stage.classList.add('is-intro');
    }
  }

  function scheduleFocusTransition() {
    if (!stage || stage.getClientRects().length === 0) return;
    resetFocusMode();
    if (isDedicated) {
      scheduleInputFocus();
      return;
    }
    focusTimer = global.setTimeout(() => {
      stage.classList.remove('is-intro');
      stage.classList.add('is-focused');
    }, 640);
  }

  function setStatus(message, type = '') {
    statusEl.textContent = message;
    statusEl.dataset.state = type;
  }

  function setLoadingMessage(message, { retry = false } = {}) {
    if (loadingMessageEl) loadingMessageEl.textContent = message;
    else if (loadingEl) loadingEl.textContent = message;
    if (retryButton) retryButton.hidden = !retry;
  }

  function setActivity(message) {
    activityEl.textContent = message;
    activityEl.classList.add('is-active');
    global.clearTimeout(activityTimer);
    activityTimer = global.setTimeout(() => activityEl.classList.remove('is-active'), 520);
    if (stage) {
      stage.classList.remove('typing-pulse');
      void stage.offsetWidth;
      stage.classList.add('typing-pulse');
    }
  }

  function canFocusInput() {
    return Boolean(
      inputEl &&
      !inputEl.disabled &&
      !inputEl.readOnly &&
      inputEl.getClientRects().length > 0
    );
  }

  function focusInput() {
    if (!canFocusInput()) return false;
    inputEl.focus({ preventScroll: true });
    return document.activeElement === inputEl;
  }

  function scheduleInputFocus() {
    // The Phase 3 layer is revealed after the office transition. A single
    // focus() call can run before the hidden layer has layout and be ignored
    // by the browser, so retry on the next frame and once after the reveal.
    global.requestAnimationFrame(focusInput);
    global.setTimeout(focusInput, 0);
    global.setTimeout(focusInput, 160);
  }

  function calculateMetrics() {
    const source = String(article?.text || '');
    const value = String(inputEl.value || '');
    const elapsedMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
    let correct = 0;
    let errors = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (source[index] === value[index]) correct += 1;
      else errors += 1;
    }
    const accuracy = value.length ? Math.round((correct / value.length) * 100) : 0;
    const elapsedMinutes = elapsedMs / 60000;
    const wpm = elapsedMs >= 1000 ? Math.round((value.length / 5) / elapsedMinutes) : 0;
    return {
      wpm,
      accuracy,
      errors,
      elapsedSeconds: Math.floor(elapsedMs / 1000),
      chars: value.length,
      correct,
    };
  }

  function renderMetrics() {
    const metrics = calculateMetrics();
    wpmEl.textContent = String(metrics.wpm);
    accuracyEl.textContent = `${metrics.accuracy}%`;
    errorsEl.textContent = String(metrics.errors);
    elapsedEl.textContent = formatTime(metrics.elapsedSeconds);
    return metrics;
  }

  function startTimer() {
    if (!startedAt) startedAt = Date.now();
    if (!timerId) timerId = global.setInterval(renderMetrics, 250);
    renderMetrics();
  }

  function stopTimer() {
    if (timerId) global.clearInterval(timerId);
    timerId = null;
  }

  function renderResult(saveState, metrics) {
    const sourceLink = /^https?:\/\//i.test(article?.url || '')
      ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noreferrer">원문 링크 ↗</a>`
      : '';
    const translation = article?.translationKo || global.PerworArticleEnrichment?.missingTranslation || '해당 문장의 한국어 해석을 준비 중입니다.';
    const summary = article?.summaryKo || global.PerworArticleEnrichment?.missingSummary || '기사 본문 정보를 확인할 수 없어 핵심 요약을 제공하지 못했습니다.';
    resultEl.innerHTML = `
      <strong>타이핑 미션 결과</strong>
      <span>최종 WPM ${metrics.wpm} · 정확도 ${metrics.accuracy}% · 오타 ${metrics.errors} · 소요 시간 ${formatTime(metrics.elapsedSeconds)}</span>
      <div class="result-scroll">
        <b>${escapeHtml(article?.title || '오늘의 글로벌 업무 지문')}</b>
        <small>${escapeHtml(article?.source || '')} · ${escapeHtml(article?.publishedAt || '')}</small>
        <p><b>한국어 해석</b><br>${escapeHtml(translation)}</p>
        <p><b>뉴스 핵심 요약</b><br>${escapeHtml(summary)}</p>
        ${sourceLink}
      </div>
      <em class="save-state ${saveState.saved ? 'saved' : 'not-saved'}">${escapeHtml(saveState.message)}</em>`;
    promptEl.hidden = true;
    resultEl.hidden = false;
    setStatus(saveState.message, saveState.saved ? 'saved' : 'guest');
  }

  async function loadArticle() {
    const requestId = ++loadingRequestId;
    loadingEl.hidden = false;
    promptEl.hidden = true;
    resultEl.hidden = true;
    completeButton.disabled = true;
    inputEl.disabled = true;
    setLoadingMessage('실제 타이핑 학습 지문을 불러오는 중…');
    try {
      const payload = await bridge.getTypingContent();
      if (requestId !== loadingRequestId) return;
      const candidates = Array.isArray(payload?.articles) ? payload.articles : [payload?.article];
      const unique = candidates.filter((item, index, list) => item && list.findIndex(candidate => (candidate.sentenceId || candidate.text) === (item.sentenceId || item.text)) === index);
      article = global.PerworArticleEnrichment?.normalize(unique[0]) || unique[0] || null;
      if (!article?.text) throw new Error('서버에서 사용할 수 있는 타이핑 지문을 받지 못했습니다.');
      sourceEl.textContent = article.text;
      inputEl.value = '';
      inputEl.disabled = false;
      completeButton.disabled = false;
      loadingEl.hidden = true;
      promptEl.hidden = false;
      setStatus('모니터의 지문을 보고 영어로 입력하세요.');
      renderMetrics();
      // The standalone prototype may autofocus immediately. In the Phase 3
      // office route the stage is hidden until the monitor is selected, so do
      // not start the timer while the user is still in the office scene.
      if (stage.getClientRects().length > 0) {
        scheduleFocusTransition();
        scheduleInputFocus();
      }
    } catch (error) {
      if (requestId !== loadingRequestId) return;
      console.error('[Perwor image prototype] typing content load failed', error);
      // Never leave a previous sentence visible when a refresh/retry fails.
      // A stale passage could look like a successful load and could be
      // submitted against a missing or obsolete article object.
      article = null;
      sourceEl.textContent = '';
      inputEl.value = '';
      inputEl.disabled = true;
      completeButton.disabled = true;
      promptEl.hidden = true;
      resultEl.hidden = true;
      const message = error.status === 401
        ? '로그인 상태를 확인할 수 없습니다. 로그인 후 다시 시도해주세요.'
        : error.status === 404
          ? '학습 API를 찾을 수 없습니다. 백엔드 연결을 확인한 뒤 다시 시도해주세요.'
          : error.status >= 500 || error.name === 'TypeError' || error.name === 'AbortError'
            ? '학습 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'
            : `지문을 불러오지 못했습니다: ${error.message}`;
      setLoadingMessage(message, { retry: true });
      setStatus('실제 학습 지문을 불러오지 못했습니다. 다시 시도해주세요.', 'error');
    }
  }

  // Phase 3 reuses this same prototype inside the office route. Resetting the
  // controller here keeps a second workstation visit from showing the prior
  // result or reusing the previous sentence.
  function resetForReuse() {
    stopTimer();
    resetFocusMode();
    locked = false;
    article = null;
    startedAt = 0;
    inputEl.value = '';
    inputEl.disabled = true;
    completeButton.disabled = true;
    sourceEl.textContent = '';
    loadingEl.hidden = false;
    promptEl.hidden = true;
    resultEl.hidden = true;
    setLoadingMessage('실제 타이핑 학습 지문을 불러오는 중…');
    setStatus('새 학습 지문을 준비하는 중…');
    renderMetrics();
    loadArticle();
  }

  async function complete() {
    if (locked || !article) return;
    const value = String(inputEl.value || '').trim();
    const source = String(article.text || '').trim();
    if (!value) {
      setStatus('먼저 영어 지문을 입력해주세요.', 'error');
      inputEl.focus();
      return;
    }
    if (value.length < source.length) {
      setStatus('지문을 끝까지 입력한 뒤 완료해주세요.', 'error');
      inputEl.focus();
      return;
    }

    locked = true;
    stopTimer();
    const metrics = renderMetrics();
    inputEl.disabled = true;
    completeButton.disabled = true;
    setStatus('결과를 서버에 저장하는 중…');
    let saveState = { saved: false, authenticated: false, message: '' };
    try {
      const payload = await bridge.saveTypingResult({ article, answerText: value, metrics });
      saveState = { saved: true, authenticated: true, message: payload?.record ? '계정 학습 기록에 저장되었습니다.' : '학습 결과가 저장되었습니다.' };
    } catch (error) {
      console.error('[Perwor image prototype] typing result save failed', error);
      saveState = {
        saved: false,
        authenticated: error.status !== 401,
        message: error.status === 401 || error.name === 'TypeError'
          ? '로그인 세션을 확인할 수 없어 학습 기록은 저장되지 않았습니다. 로그인 후 다시 시도해주세요.'
          : '학습 기록을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
      };
    }
    renderResult(saveState, metrics);
    global.dispatchEvent(new CustomEvent('perwor:typing-result-ready', {
      detail: { metrics, saveState },
    }));
  }

  inputEl.addEventListener('focus', startTimer);
  inputEl.addEventListener('input', () => {
    startTimer();
    setActivity('입력 감지');
    setStatus('입력 중 · 화면의 영어 지문을 끝까지 입력하세요.');
  });
  retryButton?.addEventListener('click', () => loadArticle());
  completeButton.addEventListener('click', complete);
  backButton.addEventListener('click', () => {
    stopTimer();
    global.location.href = returnTarget;
  });

  if ('ResizeObserver' in global) new ResizeObserver(mapMonitorUi).observe(stage);
  global.addEventListener('resize', mapMonitorUi);
  global.addEventListener('perwor:phase3-typing-opened', () => {
    scheduleFocusTransition();
    scheduleInputFocus();
  });
  mapMonitorUi();
  resetFocusMode();
  renderMetrics();
  global.__perworImageTypingReset = resetForReuse;
  loadArticle();
})(window);
