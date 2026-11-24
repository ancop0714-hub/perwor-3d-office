(function mountPerworMonitorMotion(global) {
  'use strict';

  const doc = global.document;
  const root = doc.querySelector('[data-workstation-hub]');
  const stage = root && root.querySelector('.hub-stage');
  const reference = stage && stage.querySelector('.hub-reference');
  if (!root || !stage || !reference || stage.querySelector('[data-monitor-motion]')) return;

  const reducedMotion = Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const screen = { x: 31.7, y: 16.2, width: 38.2, height: 20.25 };
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('hub-monitor-motion');
  svg.setAttribute('data-monitor-motion', '');
  svg.setAttribute('viewBox', '0 0 100 66.6667');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.cssText = 'position:absolute;inset:0;z-index:2;width:100%;height:100%;display:block;pointer-events:none;overflow:visible;';

  const style = doc.createElement('style');
  style.setAttribute('data-monitor-motion-style', '');
  style.textContent = `
    .hub-monitor-motion .monitor-screen-sheen {
      animation: perwor-monitor-breathe 6s ease-in-out infinite;
    }
    .hub-monitor-motion .monitor-motion-line {
      animation: perwor-monitor-line-shift 8s ease-in-out infinite;
      transform-box: fill-box;
      transform-origin: center;
    }
    .hub-monitor-motion .monitor-motion-line:nth-child(2) { animation-delay: -2.2s; }
    .hub-monitor-motion .monitor-motion-line:nth-child(3) { animation-delay: -4.4s; }
    @keyframes perwor-monitor-breathe {
      0%, 100% { opacity: .08; }
      50% { opacity: .2; }
    }
    @keyframes perwor-monitor-line-shift {
      0%, 100% { opacity: .06; transform: translateX(-.35px); }
      50% { opacity: .15; transform: translateX(.6px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .hub-monitor-motion .monitor-screen-sheen,
      .hub-monitor-motion .monitor-motion-line { animation: none; }
      .hub-monitor-motion .monitor-screen-sheen { opacity: .12; }
      .hub-monitor-motion .monitor-motion-line { opacity: .08; }
    }
  `;
  doc.head.appendChild(style);

  const defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const clip = doc.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clip.setAttribute('id', 'perwor-monitor-screen-clip');
  const clipRect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  clipRect.setAttribute('x', String(screen.x));
  clipRect.setAttribute('y', String(screen.y));
  clipRect.setAttribute('width', String(screen.width));
  clipRect.setAttribute('height', String(screen.height));
  clipRect.setAttribute('rx', '1.6');
  clip.appendChild(clipRect);
  defs.appendChild(clip);

  const sheen = doc.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  sheen.setAttribute('id', 'perwor-monitor-sheen-gradient');
  sheen.setAttribute('x1', '0%');
  sheen.setAttribute('y1', '0%');
  sheen.setAttribute('x2', '100%');
  sheen.setAttribute('y2', '100%');
  [
    ['0%', '#ffffff', '.02'],
    ['48%', '#a8d6ff', '.16'],
    ['100%', '#ffffff', '.02']
  ].forEach(([offset, color, opacity]) => {
    const stop = doc.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    stop.setAttribute('stop-opacity', opacity);
    sheen.appendChild(stop);
  });
  defs.appendChild(sheen);
  svg.appendChild(defs);

  const screenGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  screenGroup.setAttribute('clip-path', 'url(#perwor-monitor-screen-clip)');

  const screenSheen = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  screenSheen.classList.add('monitor-screen-sheen');
  screenSheen.setAttribute('x', String(screen.x));
  screenSheen.setAttribute('y', String(screen.y));
  screenSheen.setAttribute('width', String(screen.width));
  screenSheen.setAttribute('height', String(screen.height));
  screenSheen.setAttribute('fill', 'url(#perwor-monitor-sheen-gradient)');
  screenSheen.setAttribute('opacity', reducedMotion ? '.12' : '.08');
  screenGroup.appendChild(screenSheen);

  const lineData = [
    [35.1, 19.2, 11.8],
    [35.1, 21.2, 29.2],
    [35.1, 23.2, 26.8]
  ];
  lineData.forEach(([x, y, width]) => {
    const line = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    line.classList.add('monitor-motion-line');
    line.setAttribute('x', String(x));
    line.setAttribute('y', String(y));
    line.setAttribute('width', String(width));
    line.setAttribute('height', '.32');
    line.setAttribute('rx', '.16');
    line.setAttribute('fill', '#ffffff');
    line.setAttribute('opacity', reducedMotion ? '.08' : '.06');
    screenGroup.appendChild(line);
  });

  svg.appendChild(screenGroup);
  stage.appendChild(svg);

  const onVisibilityChange = () => svg.classList.toggle('is-paused', doc.hidden);
  doc.addEventListener('visibilitychange', onVisibilityChange);

  global.__perworMonitorMotion = {
    destroy() {
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      svg.remove();
      style.remove();
    },
    screen
  };
})(window);
