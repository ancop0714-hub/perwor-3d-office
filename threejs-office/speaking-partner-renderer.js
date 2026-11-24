/*
 * Perwor speaking-partner rendering boundary.
 *
 * The current speaking reference is a single composed image, so this module
 * deliberately does not claim rigging, lip-sync, blend shapes, or full-body
 * animation. It gives the learning controller a stable state-machine API that
 * can later be backed by a rigged GLB/GLTF or a layered 2D/2.5D renderer.
 */
(function attachPerworSpeakingPartnerRenderer(global) {
  'use strict';

  const root = document.querySelector('[data-speaking-dedicated]');
  if (!root) return;

  const STATES = Object.freeze(['idle', 'listening', 'speaking', 'feedback']);
  const capabilities = Object.freeze({
    rendererType: 'reference-image',
    stateMachine: true,
    riggedModel: false,
    animationClips: false,
    blendShapes: false,
    lipSync: false,
    independentCharacterLayer: false,
    stateCueOnly: true,
  });

  function isValidState(value) {
    return STATES.includes(String(value));
  }

  function readState(detail) {
    if (typeof detail === 'string') return detail;
    return detail && typeof detail.state === 'string' ? detail.state : '';
  }

  class SpeakingPartnerRenderer {
    constructor(shell) {
      this.shell = shell;
      this.layer = shell.querySelector('[data-speaking-partner]');
      this.adapter = null;
      this.state = 'idle';
      this.connected = false;
      this.handleStateEvent = event => {
        const next = readState(event?.detail);
        if (next) this.setState(next, event.detail);
      };
      this.handleOpenEvent = () => this.setState('idle', { source: 'speaking-opened' });
      this.handleCloseEvent = () => this.setState('idle', { source: 'speaking-closed' });
      this.render();
    }

    connect(eventTarget = global) {
      if (this.connected) return this;
      this.eventTarget = eventTarget;
      eventTarget.addEventListener('perwor:speaking-partner-state', this.handleStateEvent);
      eventTarget.addEventListener('perwor:phase4-speaking-opened', this.handleOpenEvent);
      eventTarget.addEventListener('perwor:phase4-learning-closed', this.handleCloseEvent);
      this.connected = true;
      return this;
    }

    disconnect() {
      if (!this.connected || !this.eventTarget) return this;
      this.eventTarget.removeEventListener('perwor:speaking-partner-state', this.handleStateEvent);
      this.eventTarget.removeEventListener('perwor:phase4-speaking-opened', this.handleOpenEvent);
      this.eventTarget.removeEventListener('perwor:phase4-learning-closed', this.handleCloseEvent);
      this.connected = false;
      return this;
    }

    setAdapter(adapter) {
      this.adapter = adapter && typeof adapter.setState === 'function' ? adapter : null;
      if (this.adapter) {
        try { this.adapter.setState(this.state); } catch (error) { console.warn('[Perwor] speaking adapter state sync failed', error); }
      }
      return this;
    }

    setState(next, detail = {}) {
      const normalized = String(next || '').toLowerCase();
      if (!isValidState(normalized)) return false;
      this.state = normalized;
      this.render();
      if (this.adapter) {
        try { this.adapter.setState(normalized, detail); } catch (error) { console.warn('[Perwor] speaking adapter state update failed', error); }
      }
      global.dispatchEvent(new CustomEvent('perwor:speaking-partner-state-changed', {
        detail: { state: normalized, capabilities, ...detail },
      }));
      return true;
    }

    render() {
      this.shell.dataset.partnerState = this.state;
      this.shell.dataset.partnerRenderer = capabilities.rendererType;
      if (this.layer) {
        this.layer.dataset.partnerState = this.state;
        this.layer.setAttribute('data-renderer-capabilities', Object.entries(capabilities).filter(([, value]) => value === true).map(([key]) => key).join(','));
      }
      for (const state of STATES) this.shell.classList.toggle(`partner-state-${state}`, state === this.state);
    }

    getCapabilities() {
      return { ...capabilities };
    }
  }

  const renderer = new SpeakingPartnerRenderer(root).connect();
  global.PerworSpeakingPartnerRenderer = SpeakingPartnerRenderer;
  global.__perworSpeakingPartnerRenderer = renderer;
  global.__perworSpeakingPartnerState = (state, detail) => renderer.setState(state, detail);
  global.__perworSpeakingPartnerCapabilities = renderer.getCapabilities();
})(window);
