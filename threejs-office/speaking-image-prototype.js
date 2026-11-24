/*
 * Phase 4 first-person speaking scene.
 *
 * The artwork is kept as the visual foundation; this controller owns only
 * the accessible speaking interaction layered on top of the microphone scene.
 * It follows the original Perwor two-step flow: answer confirmation first,
 * then structured feedback and server persistence.
 */
(function attachPerworSpeakingPrototype(global) {
  'use strict';

  const root = document.querySelector('[data-speaking-dedicated]');
  if (!root || !global.PerworLearningBridge) return;

  const bridge = new global.PerworLearningBridge();
  const promptEl = root.querySelector('[data-speaking-prompt]');
  const monitorEl = root.querySelector('[data-speaking-monitor]');
  const statusEl = root.querySelector('[data-speaking-status]');
  const feedbackEl = root.querySelector('[data-speaking-feedback]');
  const micButton = root.querySelector('[data-speaking-mic]');
  const playButton = root.querySelector('[data-speaking-play]');
  const typeButton = root.querySelector('[data-speaking-type]');
  const retryButton = root.querySelector('[data-speaking-retry]');
  const inputEl = root.querySelector('[data-speaking-input]');
  const actionsEl = root.querySelector('[data-speaking-actions]');
  const confirmButton = root.querySelector('[data-speaking-confirm]');
  const feedbackButton = root.querySelector('[data-speaking-feedback-action]');

  const sentences = [
    { sentenceId: 'speaking-team-review', korean: '회의 전에 이 자료를 검토해 주실 수 있나요?', english: 'Could you review this material before the meeting?', category: '회의' },
    { sentenceId: 'speaking-report-share', korean: '이 보고서를 금요일까지 공유해 주실 수 있나요?', english: 'Could you share this report by Friday?', category: '보고서·문서' },
    { sentenceId: 'speaking-project-steps', korean: '이번 프로젝트의 다음 단계를 논의해 봅시다.', english: 'Let us discuss the next steps for this project.', category: '프로젝트' },
    { sentenceId: 'speaking-client-feedback', korean: '고객의 피드백을 반영해 문서를 업데이트했습니다.', english: 'I updated the document based on the client feedback.', category: '고객·피드백' },
    { sentenceId: 'speaking-schedule-change', korean: '일정이 변경되면 바로 알려드리겠습니다.', english: 'I will let you know right away if the schedule changes.', category: '일정' },
  ];

  let cursor = 0;
  let current = sentences[0];
  let recognition = null;
  let generation = 0;
  let restartTimer = null;
  let silenceTimer = null;
  let promptAudio = null;
  let promptAudioUrl = '';
  let state = { answer: '', source: '', confirmed: false, feedbackCompleted: false, feedback: null, saveState: null, startedAt: 0, pauseCount: 0 };
  const setPartnerState = (next, detail = {}) => {
    try { global.__perworSpeakingPartnerState?.(next, detail); } catch (error) { console.warn('[Perwor] speaking partner state update skipped', error); }
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokenSet = value => normalize(value).split(' ').filter(Boolean);

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function clearTimers() {
    global.clearTimeout(restartTimer);
    global.clearTimeout(silenceTimer);
    restartTimer = null;
    silenceTimer = null;
  }

  function stopPromptAudio() {
    try { global.speechSynthesis?.cancel(); } catch {}
    if (promptAudio) {
      try { promptAudio.pause(); promptAudio.currentTime = 0; } catch {}
      promptAudio = null;
    }
    if (promptAudioUrl) {
      try { URL.revokeObjectURL(promptAudioUrl); } catch {}
      promptAudioUrl = '';
    }
  }

  async function playPromptAudio() {
    stopPromptAudio();
    setPartnerState('speaking', { source: 'prompt-audio' });
    setStatus('문장을 읽어드릴게요.');
    if (playButton) playButton.disabled = true;
    try {
      const response = await fetch(bridge.url('/api/tts'), {
        method: 'POST',
        headers: { Accept: 'audio/mpeg', 'Content-Type': 'application/json' },
        credentials: bridge.sameOrigin ? 'include' : 'omit',
        body: JSON.stringify({ text: current.english, language: 'en-US' }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('audio')) {
        const blob = await response.blob();
        promptAudioUrl = URL.createObjectURL(blob);
        promptAudio = new Audio(promptAudioUrl);
        promptAudio.onended = () => { setPartnerState('idle', { source: 'prompt-audio-ended' }); if (playButton) playButton.disabled = false; setStatus('문장을 들었어요. 영어로 답변해보세요.'); };
        await promptAudio.play();
        return;
      }
    } catch {}
    if ('speechSynthesis' in global && typeof global.SpeechSynthesisUtterance === 'function') {
      const utterance = new global.SpeechSynthesisUtterance(current.english);
      utterance.lang = 'en-US';
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.onend = () => { setPartnerState('idle', { source: 'prompt-speech-ended' }); if (playButton) playButton.disabled = false; setStatus('문장을 들었어요. 영어로 답변해보세요.'); };
      utterance.onerror = () => { setPartnerState('idle', { source: 'prompt-speech-error' }); if (playButton) playButton.disabled = false; setStatus('음성 재생에 실패했어요. 문장을 읽고 영어로 답변해보세요.'); };
      global.speechSynthesis.speak(utterance);
      return;
    }
    if (playButton) playButton.disabled = false;
    setPartnerState('idle', { source: 'prompt-audio-unavailable' });
    setStatus('음성 재생을 지원하지 않는 브라우저예요. 문장을 읽고 영어로 답변해보세요.');
  }

  function stopRecognition() {
    generation += 1;
    clearTimers();
    const old = recognition;
    recognition = null;
    if (old) {
      old.onstart = null;
      old.onspeechstart = null;
      old.onspeechend = null;
      old.onresult = null;
      old.onerror = null;
      old.onend = null;
      try { old.abort?.(); } catch { try { old.stop?.(); } catch {} }
    }
    if (micButton) micButton.disabled = false;
    if (retryButton) retryButton.disabled = !state.answer;
  }

  function renderSentence() {
    setPartnerState('idle', { source: 'sentence-render' });
    if (promptEl) promptEl.textContent = current.korean;
    if (monitorEl) monitorEl.textContent = `한국어 업무 상황을 영어로 답변해보세요. · ${current.category}`;
    if (feedbackEl) { feedbackEl.hidden = true; feedbackEl.innerHTML = ''; }
    if (inputEl) { inputEl.value = ''; inputEl.hidden = true; }
    if (actionsEl) actionsEl.hidden = true;
    if (feedbackButton) feedbackButton.disabled = true;
    if (confirmButton) confirmButton.disabled = false;
    if (retryButton) retryButton.disabled = true;
    if (playButton) playButton.disabled = false;
    setStatus('마이크를 누르거나 영어로 입력해 답변을 시작하세요.');
  }

  function resetAttempt() {
    stopRecognition();
    stopPromptAudio();
    state = { answer: '', source: '', confirmed: false, feedbackCompleted: false, feedback: null, saveState: null, startedAt: 0, pauseCount: 0 };
    renderSentence();
  }

  function revealAnswer(answer, source = 'speech') {
    const text = String(answer || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    state.answer = text;
    state.source = source;
    setPartnerState('idle', { source: 'answer-revealed' });
    if (inputEl) { inputEl.value = text; inputEl.hidden = false; inputEl.focus({ preventScroll: true }); }
    if (actionsEl) actionsEl.hidden = false;
    if (confirmButton) confirmButton.disabled = false;
    if (feedbackButton) feedbackButton.disabled = true;
    if (retryButton) retryButton.disabled = false;
    setStatus('인식된 답변을 확인한 뒤 답변 확인을 눌러주세요.');
  }

  function resetAndStartRecognition() {
    stopRecognition();
    state.answer = '';
    state.source = '';
    state.confirmed = false;
    state.feedbackCompleted = false;
    state.feedback = null;
    state.startedAt = 0;
    if (inputEl) { inputEl.value = ''; inputEl.hidden = true; }
    if (actionsEl) actionsEl.hidden = true;
    if (feedbackEl) { feedbackEl.hidden = true; feedbackEl.innerHTML = ''; }
    if (feedbackButton) feedbackButton.disabled = true;
    if (confirmButton) confirmButton.disabled = false;
    setPartnerState('idle', { source: 'recognition-reset' });
    setStatus('다시 말해주세요. 새 음성 인식을 시작합니다.');
    restartTimer = global.setTimeout(() => startRecognition(), 140);
  }

  function startRecognition() {
    const Recognition = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus('이 브라우저는 음성 인식을 지원하지 않습니다. 영어로 입력해주세요.');
      if (typeButton) typeButton.click();
      return;
    }
    if (recognition) return;
    const session = ++generation;
    const recognizer = new Recognition();
    recognition = recognizer;
    recognizer.lang = 'en-US';
    recognizer.continuous = true;
    recognizer.interimResults = true;
    const finalResults = new Map();
    let lastKey = '';
    let interim = '';
    state.answer = '';
    state.source = 'speech';
    state.startedAt = Date.now();
    setPartnerState('listening', { source: 'speech-recognition-start' });
    if (micButton) micButton.disabled = true;
    if (retryButton) retryButton.disabled = true;
    if (feedbackEl) { feedbackEl.hidden = true; feedbackEl.innerHTML = ''; }
    setStatus('듣고 있어요. 영어로 답변한 뒤 OK 또는 오케이라고 말해주세요.');

    const committed = () => [...finalResults.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value).filter(Boolean).join(' ').trim();
    recognizer.onstart = () => { if (session === generation) setStatus('듣고 있어요. 영어 문장을 말해주세요.'); };
    recognizer.onspeechstart = () => { if (session === generation) clearTimers(); };
    recognizer.onspeechend = () => {
      if (session !== generation || !committed()) return;
      clearTimers();
      silenceTimer = global.setTimeout(() => {
        if (session === generation && recognition === recognizer && !state.confirmed) recognizer.stop();
      }, 1200);
    };
    recognizer.onresult = event => {
      if (session !== generation || recognition !== recognizer) return;
      interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = String(result?.[0]?.transcript || '').trim();
        if (!transcript) continue;
        if (result.isFinal) {
          const key = normalize(transcript);
          if (finalResults.get(index) === transcript || (finalResults.get(index) === undefined && key === lastKey)) continue;
          finalResults.set(index, transcript);
          lastKey = key;
        } else interim += ` ${transcript}`;
      }
      const heard = `${committed()} ${interim}`.replace(/\s+/g, ' ').trim();
      if (!heard) return;
      const retryMatch = heard.match(/(?:^|\s)(다시|again|retry)(?:[.!?,]|\s|$)/i);
      if (retryMatch) { resetAndStartRecognition(); return; }
      const okMatch = heard.match(/(?:^|\s)(ok|okay|오케이)(?:[.!?,]|\s|$)/i);
      if (okMatch) {
        const answer = heard.slice(0, okMatch.index).trim();
        if (answer) { recognizer.stop(); revealAnswer(answer, 'voice-ok'); setStatus('“OK”를 확인했어요. 답변을 확인해주세요.'); return; }
      }
      state.answer = committed();
      if (state.answer) setStatus(`인식 중: ${state.answer}`);
    };
    recognizer.onerror = event => {
      if (session !== generation || recognition !== recognizer) return;
      const heard = committed();
      recognition = null;
      if (micButton) micButton.disabled = false;
      if (retryButton) retryButton.disabled = !heard;
      if (heard) revealAnswer(heard, 'speech');
      setStatus(event.error === 'not-allowed' ? '마이크 권한이 거부되었습니다. 브라우저에서 허용하거나 영어로 입력해주세요.' : '음성을 인식하지 못했어요. 다시 인식하거나 영어로 입력해주세요.');
    };
    recognizer.onend = () => {
      if (session !== generation || recognition !== recognizer) return;
      recognition = null;
      clearTimers();
      if (micButton) micButton.disabled = false;
      const heard = committed();
      if (heard && !state.confirmed) revealAnswer(heard, 'speech');
      if (!heard) setStatus('음성을 인식하지 못했어요. 다시 인식하거나 영어로 입력해주세요.');
    };
    try { recognizer.start(); } catch (error) {
      recognition = null;
      if (micButton) micButton.disabled = false;
      setStatus(`음성 인식을 시작하지 못했어요: ${error.message || '다시 시도해주세요.'}`);
    }
  }

  function confirmAnswer() {
    const text = String(inputEl?.value || state.answer || '').replace(/\s+/g, ' ').trim();
    if (!text) { setStatus('영어 답변을 먼저 말하거나 입력해주세요.'); return; }
    stopRecognition();
    state.answer = text;
    state.confirmed = true;
    state.feedbackCompleted = false;
    setPartnerState('idle', { source: 'answer-confirmed' });
    if (inputEl) { inputEl.value = text; inputEl.hidden = false; }
    if (actionsEl) actionsEl.hidden = false;
    if (confirmButton) confirmButton.disabled = true;
    if (feedbackButton) feedbackButton.disabled = false;
    setStatus('답변이 확인되었습니다. 피드백 받기를 눌러주세요.');
  }

  function makeFeedback(answer) {
    const expected = tokenSet(current.english);
    const actual = tokenSet(answer);
    const synonyms = [['review', 'check', 'examine'], ['material', 'document', 'file'], ['share', 'send', 'provide'], ['meeting', 'call'], ['before', 'prior']];
    const equivalent = (a, b) => a === b || synonyms.some(group => group.includes(a) && group.includes(b));
    const content = expected.filter(word => !new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'this', 'that', 'is', 'are', 'be', 'it', 'for', 'in', 'on', 'with', 'i', 'we', 'you', 'please', 'could', 'can', 'would']).has(word));
    const matchedContent = content.filter(word => actual.some(candidate => equivalent(word, candidate)));
    const matched = expected.filter(word => actual.some(candidate => equivalent(word, candidate)));
    const meaningScore = Math.min(100, Math.round((matchedContent.length / Math.max(content.length, 1)) * 70 + (matched.length / Math.max(expected.length, 1)) * 30));
    const orderScore = Math.round(expected.reduce((score, word, index) => score + (actual[index] && equivalent(word, actual[index]) ? 1 : 0), 0) / Math.max(expected.length, 1) * 100);
    const grammarErrors = actual.length < Math.max(2, expected.length * .55) ? ['핵심 문장 구조가 충분히 완성되지 않았습니다.'] : [];
    const grammarScore = Math.max(0, Math.min(100, Math.round(orderScore * .65 + meaningScore * .35 - grammarErrors.length * 8)));
    const vocabularyScore = Math.max(0, Math.min(100, Math.round(matchedContent.length / Math.max(content.length, 1) * 100)));
    const fluencyScore = state.source === 'typing' ? null : Math.max(0, Math.min(100, 100 - Number(state.pauseCount || 0) * 12));
    const weighted = [[meaningScore, 30], [grammarScore, 25], [vocabularyScore, 15], [fluencyScore, 15]].filter(([score]) => score !== null);
    const totalWeight = weighted.reduce((sum, [, weight]) => sum + weight, 0);
    const totalScore = Math.round(weighted.reduce((sum, [score, weight]) => sum + score * weight, 0) / Math.max(totalWeight, 1));
    const confusedExpressions = [...new Set(content.filter(word => !actual.some(candidate => equivalent(word, candidate))))].slice(0, 8).map(term => ({ term, feedback: '추천 문장에서 이 표현의 뜻과 위치를 다시 확인해보세요.' }));
    return {
      meaningScore, grammarScore, vocabularyScore, fluencyScore, pronunciationScore: null, totalScore,
      evidence: [
        `의미·과제 수행: ${meaningScore}점 · 핵심 표현 ${matchedContent.length}/${Math.max(content.length, 1)}개가 확인되었습니다.`,
        `문법 정확성: ${grammarScore}점 · 어순 일치도 ${orderScore}%입니다.${grammarErrors.length ? ` ${grammarErrors.join(' ')}` : ' 큰 구조 오류가 확인되지 않았습니다.'}`,
        `어휘·업무 표현: ${vocabularyScore}점 · 핵심 업무 표현 일치율을 반영했습니다.`,
        state.source === 'typing' ? '유창성·멈춤: 직접 입력에서는 발화 멈춤을 측정하지 않습니다.' : `유창성·멈춤: ${fluencyScore}점 · 감지된 멈춤 ${state.pauseCount || 0}회를 반영했습니다.`,
        '발음·이해 가능성: 발음 전용 API가 연결되지 않아 분석 불가로 처리했습니다.',
      ],
      confusedExpressions,
      feedbackKo: totalScore >= 80 ? '핵심 의미와 업무 표현이 자연스럽게 전달되었습니다.' : '핵심 의미는 일부 전달되었지만 문법·어휘·문장 구조를 다시 연습해보세요.',
      needsReview: totalScore < 80,
    };
  }

  async function requestFeedback() {
    if (!state.confirmed || state.feedbackCompleted) return;
    setPartnerState('feedback', { source: 'feedback-requested' });
    state.feedback = makeFeedback(state.answer);
    state.feedbackCompleted = true;
    const f = state.feedback;
    const confused = f.confusedExpressions.length ? f.confusedExpressions.map(item => escapeHtml(item.term)).join(', ') : '이번 답변에서 특별히 누락된 표현이 없어요.';
    if (feedbackEl) {
      feedbackEl.hidden = false;
      feedbackEl.innerHTML = `<b>${f.totalScore >= 80 ? '피드백 완료 · 학습 완료 기준을 충족했어요.' : '피드백 완료 · 80점 미만이라 복습 문장으로 저장돼요.'}</b><br>내 답변: ${escapeHtml(state.answer)}<br><b>추천 문장</b>: ${escapeHtml(current.english)}<br><span>의미·과제 ${f.meaningScore}점 · 문법 ${f.grammarScore}점 · 어휘·업무 표현 ${f.vocabularyScore}점 · 유창성·멈춤 ${f.fluencyScore === null ? '측정 불가' : `${f.fluencyScore}점`} · 발음 분석 불가 · 종합 ${f.totalScore}점</span><br><b>한국어 피드백</b>: ${escapeHtml(f.feedbackKo)}<br><b>헷갈린 단어·표현</b>: ${confused}<br><button type="button" class="speech-control secondary" data-speaking-next>다음 문장</button>`;
      feedbackEl.querySelector('[data-speaking-next]').addEventListener('click', () => {
        cursor = (cursor + 1) % sentences.length;
        current = sentences[cursor];
        resetAttempt();
        setStatus('다음 업무 문장을 준비했어요.');
      });
    }
    if (feedbackButton) feedbackButton.disabled = true;
    setStatus('피드백을 확인했어요. 결과를 계정에 저장하는 중…');
    try {
      const payload = await bridge.saveSpeakingResult({ sentence: current, answerText: state.answer, feedback: f });
      state.saveState = { saved: true, message: payload?.record ? '계정 학습 기록에 저장되었습니다.' : '학습 결과가 저장되었습니다.' };
      setStatus(state.saveState.message);
    } catch (error) {
      state.saveState = { saved: false, message: error.status === 401 || error.name === 'TypeError' ? '로그인 세션을 확인할 수 없어 저장되지 않았습니다.' : '학습 기록을 저장하지 못했습니다.' };
      setStatus(state.saveState.message);
    }
    if (feedbackEl && state.saveState) feedbackEl.insertAdjacentHTML('beforeend', `<br><small>${escapeHtml(state.saveState.message)}</small>`);
    global.dispatchEvent(new CustomEvent('perwor:speaking-result-ready', { detail: { sentence: current, feedback: f, saveState: state.saveState } }));
  }

  function showInput() {
    stopRecognition();
    setPartnerState('listening', { source: 'typed-answer-mode' });
    if (inputEl) { inputEl.hidden = false; inputEl.focus({ preventScroll: true }); }
    if (actionsEl) actionsEl.hidden = false;
    if (confirmButton) confirmButton.disabled = false;
    setStatus('영어 답변을 입력한 뒤 답변 확인을 눌러주세요.');
    state.source = 'typing';
  }

  async function loadSentence() {
    try {
      const payload = await bridge.getLearning();
      const due = Array.isArray(payload?.due) ? payload.due.find(item => item?.source === 'speaking' && item?.english) : null;
      if (due) current = { sentenceId: String(due.sentence_id || due.sentenceId || `speaking-${cursor}`), korean: due.korean || sentences[cursor].korean, english: due.english, category: due.category || '복습' };
    } catch {}
    renderSentence();
  }

  function open() {
    resetAttempt();
    loadSentence();
  }

  micButton?.addEventListener('click', startRecognition);
  playButton?.addEventListener('click', playPromptAudio);
  typeButton?.addEventListener('click', showInput);
  retryButton?.addEventListener('click', resetAndStartRecognition);
  confirmButton?.addEventListener('click', confirmAnswer);
  feedbackButton?.addEventListener('click', requestFeedback);
  inputEl?.addEventListener('input', () => { state.answer = inputEl.value; state.source = 'typing'; if (inputEl.value.trim()) setStatus('입력한 답변을 확인해주세요.'); });
  global.addEventListener('perwor:phase4-speaking-opened', open);
  global.__perworSpeakingStart = open;
  global.__perworSpeakingStop = () => { stopRecognition(); stopPromptAudio(); setPartnerState('idle', { source: 'speaking-closed' }); };
  renderSentence();
})(window);
