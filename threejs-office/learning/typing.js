(function bootPerworDedicatedTyping(global) {
  'use strict';
  const root = document.querySelector('[data-typing-dedicated]');
  if (!root) return;
  document.documentElement.dataset.perworTypingRenderer = 'function-first';
  document.documentElement.dataset.perworTypingIsolated = 'true';
  if (document.querySelector('canvas')) console.error('[Perwor] Dedicated typing route must not mount a canvas.');
  global.__perworDedicatedTyping = { isolated: true, renderer: 'html-css', prohibitedModules: ['typing-scene.js', 'GLTFLoader', 'app-classic.js', 'three.js'] };
})(window);
