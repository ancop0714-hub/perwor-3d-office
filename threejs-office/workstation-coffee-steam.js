(function mountPerworCoffeeSteam(global) {
  'use strict';

  const doc = global.document;
  const root = doc.querySelector('[data-workstation-hub]');
  const stage = root && root.querySelector('.hub-stage');
  const reference = stage && stage.querySelector('.hub-reference');
  if (!root || !stage || !reference || stage.querySelector('[data-coffee-steam]')) return;

  // Normalized to the original 1536 × 1024 reference image. The stage keeps
  // that aspect ratio, so this anchor stays attached to the mug on resize.
  const VIEWBOX_WIDTH = 100;
  const VIEWBOX_HEIGHT = 66.6667;
  const mugOpening = { x: 82.75, y: 38.35 };
  const reduceMotion = Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const layer = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  layer.setAttribute('class', 'hub-steam-layer');
  layer.setAttribute('data-coffee-steam', '');
  layer.setAttribute('viewBox', `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`);
  layer.setAttribute('preserveAspectRatio', 'none');
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('focusable', 'false');
  layer.setAttribute('style', 'position:absolute;inset:0;z-index:2;width:100%;height:100%;display:block;pointer-events:none;overflow:visible;');

  const style = doc.createElement('style');
  style.setAttribute('data-coffee-steam-style', '');
  style.textContent = `
    .hub-steam-layer .steam-wisp {
      fill: none;
      stroke: #fffaf2;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
    }
  `;
  doc.head.appendChild(style);

  const makeWisp = ({ path, width, opacity }) => {
    const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'steam-wisp');
    group.setAttribute('opacity', '0');

    const line = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', path);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#fffaf2');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-width', String(width));
    line.setAttribute('stroke-opacity', String(opacity));
    group.appendChild(line);
    return { group, opacity };
  };

  const x = mugOpening.x;
  const y = mugOpening.y;
  const wisps = [
    makeWisp({
      path: `M ${x - 0.25} ${y + 0.65} C ${x - 1.55} ${y - 0.55}, ${x + 0.85} ${y - 1.65}, ${x - 0.1} ${y - 2.75} C ${x - 1.1} ${y - 3.9}, ${x + 1.15} ${y - 5.0}, ${x + 0.45} ${y - 6.55}`,
      width: 0.45,
      opacity: 0.95
    }),
    makeWisp({
      path: `M ${x + 1.05} ${y + 0.55} C ${x + 2.2} ${y - 0.7}, ${x + 0.2} ${y - 1.85}, ${x + 1.35} ${y - 3.0} C ${x + 2.4} ${y - 4.15}, ${x + 0.55} ${y - 5.2}, ${x + 1.05} ${y - 6.8}`,
      width: 0.4,
      opacity: 0.82
    }),
    makeWisp({
      path: `M ${x - 1.2} ${y + 0.72} C ${x - 2.0} ${y - 0.3}, ${x - 0.95} ${y - 1.1}, ${x - 1.35} ${y - 2.0} C ${x - 1.8} ${y - 2.95}, ${x - 0.55} ${y - 3.8}, ${x - 0.8} ${y - 4.65}`,
      width: 0.35,
      opacity: 0.68
    })
  ];
  wisps.forEach(({ group }) => layer.appendChild(group));
  stage.appendChild(layer);

  const motionSpecs = [
    { duration: 4400, phase: 1250, drift: 0.55, rise: 3.7 },
    { duration: 5100, phase: 3050, drift: -0.65, rise: 3.9 },
    { duration: 3700, phase: 650, drift: 0.4, rise: 3.0 }
  ];
  let frameId = 0;
  let startedAt = 0;

  const setStaticState = () => {
    wisps.forEach(({ group, opacity }) => {
      group.setAttribute('transform', 'translate(0 0)');
      group.setAttribute('opacity', String(opacity * 0.42));
    });
  };

  const animate = now => {
    const elapsed = now - startedAt;
    wisps.forEach(({ group, opacity }, index) => {
      const spec = motionSpecs[index];
      const progress = ((elapsed + spec.phase) % spec.duration) / spec.duration;
      const fade = Math.sin(Math.PI * progress);
      const drift = Math.sin(progress * Math.PI * 2 + index * 0.8) * spec.drift;
      const rise = -progress * spec.rise;
      group.setAttribute('transform', `translate(${drift.toFixed(3)} ${rise.toFixed(3)})`);
      group.setAttribute('opacity', String((fade * opacity).toFixed(3)));
    });
    frameId = global.requestAnimationFrame(animate);
  };

  const start = () => {
    if (reduceMotion || doc.hidden || frameId) return;
    startedAt = performance.now();
    frameId = global.requestAnimationFrame(animate);
  };
  const stop = () => {
    if (frameId) global.cancelAnimationFrame(frameId);
    frameId = 0;
  };
  const onVisibilityChange = () => {
    if (doc.hidden) stop();
    else start();
  };
  doc.addEventListener('visibilitychange', onVisibilityChange);

  if (reduceMotion) setStaticState();
  else start();

  const destroy = () => {
    stop();
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    layer.remove();
    style.remove();
  };
  global.__perworCoffeeSteam = { destroy, anchor: mugOpening };
})(window);
