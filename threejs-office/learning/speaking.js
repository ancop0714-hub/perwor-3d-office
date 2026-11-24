(function bootPerworDedicatedSpeaking(global) {
  'use strict';
  const root = document.querySelector('[data-speaking-dedicated]');
  const back = document.querySelector('[data-back-hub]');
  if (!root || !back) return;
  document.documentElement.dataset.perworSpeakingIsolated = 'true';
  back.addEventListener('click', () => {
    global.__perworSpeakingStop?.();
    global.location.href = '../workstation-hub.html';
  });
  global.__perworDedicatedSpeaking = { isolated: true, renderer: 'reference-image', prohibitedModules: ['typing-scene.js', 'GLTFLoader', 'app-classic.js', 'three.js'] };
})(window);
