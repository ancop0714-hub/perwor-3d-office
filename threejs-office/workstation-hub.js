(function bootPerworWorkstationHub(global) {
  'use strict';
  const root = document.querySelector('[data-workstation-hub]');
  const typingButton = document.querySelector('[data-hub-typing]');
  const speakingButton = document.querySelector('[data-hub-speaking]');
  const officeButton = document.querySelector('[data-hub-office]');
  const status = document.querySelector('[data-hub-status]');
  if (!root || !typingButton || !speakingButton || !officeButton) return;

  let locked = false;
  const setStatus = message => { if (status) status.textContent = message; };
  const go = (url, message) => {
    if (locked) return;
    locked = true;
    typingButton.disabled = true;
    speakingButton.disabled = true;
    setStatus(message);
    global.requestAnimationFrame(() => { global.location.href = url; });
  };

  typingButton.addEventListener('click', event => {
    event.preventDefault();
    go('./learning/typing.html?from=workstation-hub', '타이핑 학습 화면으로 이동합니다.');
  });
  speakingButton.addEventListener('click', event => {
    event.preventDefault();
    go('./learning/speaking.html?from=workstation-hub', '말하기 학습 화면으로 이동합니다.');
  });
  officeButton.addEventListener('click', event => {
    event.preventDefault();
    go('./phase1.html?scene=office', '오피스로 돌아갑니다.');
  });

  global.__perworWorkstationHub = { routes: { typing: './learning/typing.html', speaking: './learning/speaking.html' }, isolated: true };
})(window);
