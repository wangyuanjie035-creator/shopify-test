/**
 * Central Quote API client via Shopify App Proxy
 * Expected App Proxy base path: /apps/quotes
 * Endpoints (suggested):
 *  - GET    /apps/quotes                → list quotes
 *  - POST   /apps/quotes                → create quote record
 *  - PATCH  /apps/quotes/:id_or_uuid    → update quote (status/price/note)
 */
(function () {
  const DEFAULT_BASE = '/apps/quotes';

  class QuoteApiClient {
    constructor(baseUrl) {
      this.baseUrl = baseUrl || DEFAULT_BASE;
    }

    async list(params = {}) {
      const url = new URL(this.baseUrl, window.location.origin);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      });
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('Failed to fetch quotes');
      return res.json();
    }

    async create(record) {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(record),
      });
      if (!res.ok) throw new Error('Failed to create quote');
      return res.json();
    }

    async update(idOrUuid, patch) {
      const res = await fetch(`${this.baseUrl}/${encodeURIComponent(idOrUuid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Failed to update quote');
      return res.json();
    }
  }

  // expose
  window.quoteApi = new QuoteApiClient(window.QUOTE_API_BASE || DEFAULT_BASE);
})();


