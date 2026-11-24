(function mountPerworAmbientLamp(global) {
  'use strict';

  const doc = global.document;
  const root = doc.querySelector('[data-workstation-hub]');
  const stage = root && root.querySelector('.hub-stage');
  const reference = stage && stage.querySelector('.hub-reference');
  if (!root || !stage || !reference || stage.querySelector('[data-lamp-glow]')) return;

  // Normalized to the 1536 × 1024 workstation reference image.
  // The lamp opening is the only light source; all other layers project from it.
  const VIEWBOX_WIDTH = 100;
  const VIEWBOX_HEIGHT = 66.6667;
  const lampOpening = { x: 20.7, y: 24.6 };

  const ids = {
    warmCore: 'perwor-lamp-warm-core-gradient',
    warmBeam: 'perwor-lamp-warm-beam-gradient',
    warmSpill: 'perwor-lamp-warm-spill-gradient',
    beamBlur: 'perwor-lamp-beam-soften',
    spillBlur: 'perwor-lamp-spill-soften'
  };

  const layer = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  layer.classList.add('hub-lamp-glow');
  layer.setAttribute('data-lamp-glow', '');
  layer.setAttribute('viewBox', `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`);
  layer.setAttribute('preserveAspectRatio', 'none');
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('focusable', 'false');
  layer.style.cssText = 'position:absolute;inset:0;z-index:2;width:100%;height:100%;display:block;pointer-events:none;overflow:visible;mix-blend-mode:screen;';

  const style = doc.createElement('style');
  style.setAttribute('data-lamp-glow-style', '');
  style.textContent = `
    .hub-lamp-glow .lamp-warm {
      opacity: .72;
      transform-origin: ${lampOpening.x}% ${lampOpening.y}%;
      animation: perwor-lamp-breathe 5s ease-in-out infinite;
      pointer-events: none;
    }
    .hub-lamp-glow .lamp-beam { filter: url(#${ids.beamBlur}); }
    .hub-lamp-glow .lamp-desk-spill { filter: url(#${ids.spillBlur}); }
    @keyframes perwor-lamp-breathe {
      0%, 100% { opacity: .52; filter: brightness(.98); }
      50% { opacity: .88; filter: brightness(1.06); }
    }
    .hub-lamp-glow.is-paused .lamp-warm { animation-play-state: paused; }
    @media (prefers-reduced-motion: reduce) {
      .hub-lamp-glow .lamp-warm {
        animation: none;
        opacity: .68;
      }
    }
  `;
  doc.head.appendChild(style);

  const defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const makeGradient = (tagName, id, attributes, stops) => {
    const gradient = doc.createElementNS('http://www.w3.org/2000/svg', tagName);
    gradient.setAttribute('id', id);
    Object.entries(attributes).forEach(([name, value]) => gradient.setAttribute(name, String(value)));
    stops.forEach(([offset, color, opacity]) => {
      const stop = doc.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      stop.setAttribute('stop-opacity', opacity);
      gradient.appendChild(stop);
    });
    defs.appendChild(gradient);
  };

  makeGradient('radialGradient', ids.warmCore, {
    cx: '50%', cy: '45%', r: '64%'
  }, [
    ['0%', '#fffbd7', '.98'],
    ['38%', '#ffe17b', '.7'],
    ['76%', '#ffc14e', '.25'],
    ['100%', '#f4a83a', '0']
  ]);
  makeGradient('linearGradient', ids.warmBeam, {
    gradientUnits: 'userSpaceOnUse',
    x1: lampOpening.x, y1: lampOpening.y, x2: 30, y2: 48
  }, [
    ['0%', '#fff2b5', '.86'],
    ['38%', '#ffd574', '.36'],
    ['100%', '#f7b44c', '0']
  ]);
  makeGradient('radialGradient', ids.warmSpill, {
    cx: '50%', cy: '42%', r: '68%'
  }, [
    ['0%', '#ffe49a', '.64'],
    ['38%', '#ffd06a', '.3'],
    ['78%', '#f4b34d', '.08'],
    ['100%', '#f4b34d', '0']
  ]);

  const makeBlur = (id, stdDeviation) => {
    const filter = doc.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('x', '-30%');
    filter.setAttribute('y', '-30%');
    filter.setAttribute('width', '160%');
    filter.setAttribute('height', '160%');
    const blur = doc.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('stdDeviation', String(stdDeviation));
    filter.appendChild(blur);
    defs.appendChild(filter);
  };
  makeBlur(ids.beamBlur, .65);
  makeBlur(ids.spillBlur, 1.3);
  layer.appendChild(defs);

  const ellipse = (attributes) => {
    const node = doc.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    node.setAttribute('pointer-events', 'none');
    return node;
  };
  const path = (attributes) => {
    const node = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    node.setAttribute('pointer-events', 'none');
    return node;
  };

  const warm = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  warm.setAttribute('class', 'lamp-warm');
  warm.appendChild(ellipse({
    class: 'lamp-bulb-glow',
    cx: lampOpening.x,
    cy: lampOpening.y,
    rx: 5.8,
    ry: 2.35,
    fill: `url(#${ids.warmCore})`,
    transform: `rotate(-17 ${lampOpening.x} ${lampOpening.y})`
  }));
  warm.appendChild(path({
    class: 'lamp-beam',
    d: 'M 18.1 24.0 C 23.6 28.2 32.1 37.1 39.0 49.0 C 33.2 50.0 25.0 41.7 17.6 29.1 C 16.8 27.1 17.0 25.2 18.1 24.0 Z',
    fill: `url(#${ids.warmBeam})`,
    opacity: '1'
  }));
  warm.appendChild(path({
    class: 'lamp-desk-spill',
    d: 'M 17.0 38.2 C 23.4 36.8 33.6 39.3 40.7 46.8 C 35.0 52.8 23.0 54.0 16.0 48.2 C 13.8 44.9 14.4 40.6 17.0 38.2 Z',
    fill: `url(#${ids.warmSpill})`,
    opacity: '.9'
  }));

  const glow = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  glow.setAttribute('class', 'lamp-glow-body');
  glow.appendChild(warm);
  layer.appendChild(glow);
  stage.appendChild(layer);

  const onVisibilityChange = () => {
    layer.classList.toggle('is-paused', doc.hidden);
  };
  doc.addEventListener('visibilitychange', onVisibilityChange);

  global.__perworLampGlow = {
    destroy() {
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      layer.remove();
      style.remove();
    },
    anchor: lampOpening
  };
})(window);
