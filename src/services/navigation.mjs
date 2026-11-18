const routes = new Set(['observe', 'combine', 'verify']);

export function readRoute(hash) {
  if (hash === '' || hash === '#/') return 'observe';
  const name = hash.slice(2);
  return hash.startsWith('#/') && routes.has(name) ? name : null;
}

export class Navigation {
  constructor({ win = window, doc = document, version, readState, render, notify }) {
    Object.assign(this, { win, doc, version, readState, render, notify });
    this.sequence = 0;
    this.lifecycle = new AbortController();
    this.observed = win.location.href;
    this.leaving = false;
  }

  start() {
    const options = { signal: this.lifecycle.signal };
    const historyChanged = () => {
      const href = this.win.location.href;
      // Browsers can send both events for the same history entry.
      if (href === this.observed) return;
      this.observed = href;
      void this.transition(new URL(href), true);
    };
    this.win.addEventListener('popstate', historyChanged, options);
    this.win.addEventListener('hashchange', historyChanged, options);
    this.win.addEventListener('focus', () => void this.check(), options);
    this.doc.addEventListener('visibilitychange', () => {
      if (!this.doc.hidden) void this.check();
    }, options);
    this.win.addEventListener('pageshow', event => {
      if (event.persisted) {
        this.leaving = false;
        this.observed = this.win.location.href;
        this.render(readRoute(new URL(this.observed).hash), false);
      }
      void this.check();
    }, options);
    this.doc.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const link = event.target.closest?.('a[href^="#/"]');
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      event.preventDefault();
      void this.go(link.getAttribute('href'));
    }, options);
    const entry = new URL(this.observed);
    const freshNavigation = this.win.performance?.getEntriesByType('navigation')[0]?.type === 'navigate';
    this.render(readRoute(entry.hash), freshNavigation && entry.searchParams.has('build'));
    return this.check();
  }

  async check() {
    const generation = this.sequence;
    const latest = await this.version.check();
    if (generation !== this.sequence || this.lifecycle.signal.aborted || this.leaving) return;
    this.notify(this.status(latest));
  }

  status(latest) {
    if (!latest) return 'offline';
    if (latest === this.version.loaded) return 'clear';
    const state = this.readState();
    return state.dirty || state.saving ? 'protect' : 'update';
  }

  go(route) {
    const url = new URL(this.win.location.href);
    url.hash = route.startsWith('#') ? route : '#/' + route;
    return this.transition(url, false);
  }

  async transition(target, historyMove) {
    if (this.leaving || this.lifecycle.signal.aborted) return;
    const generation = ++this.sequence;
    const latest = await this.version.check();
    if (generation !== this.sequence || this.lifecycle.signal.aborted) return;
    const status = this.status(latest);
    this.notify(status);
    if (status === 'update') {
      // Change the document URL as well as its fragment, including on rollback.
      target.searchParams.set('build', latest + '-' + crypto.randomUUID());
      this.leaving = true;
      this.win.location[historyMove ? 'replace' : 'assign'](target.href);
      return;
    }
    if (!historyMove && target.href !== this.win.location.href) {
      this.win.history.pushState(null, '', target.href);
    }
    this.observed = target.href;
    this.render(readRoute(target.hash), !historyMove);
  }

  dispose() {
    this.sequence++;
    this.lifecycle.abort();
  }
}
