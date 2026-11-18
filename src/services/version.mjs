export class VersionService {
  constructor({ entry, loaded, fetcher = globalThis.fetch.bind(globalThis), timeout = 2500 }) {
    this.loaded = loaded;
    this.endpoint = new URL('./version.json', entry);
    this.fetcher = fetcher;
    this.timeout = timeout;
    this.pending = null;
  }

  check() {
    if (!this.pending) this.pending = this.fetchVersion().finally(() => { this.pending = null; });
    return this.pending;
  }

  async fetchVersion() {
    const url = new URL(this.endpoint);
    url.searchParams.set('check', crypto.randomUUID());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetcher(url, {
        cache: 'no-store', mode: 'same-origin', redirect: 'error', signal: controller.signal
      });
      if (!response.ok) return null;
      const data = await response.json();
      return typeof data?.buildId === 'string' && /^cce-[0-9a-f]{16}$/.test(data.buildId) ? data.buildId : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
