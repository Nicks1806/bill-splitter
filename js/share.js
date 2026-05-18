// Encode/decode bill state into a shareable URL fragment.
// We use URL hash (#) so the data never hits the server (in case this is hosted somewhere).

const Share = {
  // Encode state -> compact base64url string
  encode(state) {
    // Strip to minimum fields to keep URL short
    const compact = {
      t: state.title || '',
      d: state.date || '',
      n: state.note || '',
      p: (state.people || []).map(p => [p.id, p.name]),
      i: (state.items || []).map(i => [i.id, i.name, i.price, i.qty, i.assignedTo]),
      c: [
        Number(state.charges?.taxPercent) || 0,
        Number(state.charges?.servicePercent) || 0,
        Number(state.charges?.discountPercent) || 0,
        Number(state.charges?.discountAmount) || 0,
        Number(state.charges?.actualTotal) || 0,
      ],
    };
    const json = JSON.stringify(compact);
    // Encode as base64url (URL-safe)
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return b64;
  },

  decode(encoded) {
    try {
      // Restore base64 padding/chars
      let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const json = decodeURIComponent(escape(atob(b64)));
      const compact = JSON.parse(json);
      if (!compact || typeof compact !== 'object') return null;
      return {
        id: Utils.uid('bill'),
        title: compact.t || '',
        date: compact.d || Utils.todayISO(),
        note: compact.n || '',
        people: (compact.p || []).map(([id, name]) => ({ id, name })),
        items: (compact.i || []).map(([id, name, price, qty, assignedTo]) => ({
          id, name, price: Number(price) || 0, qty: Number(qty) || 1,
          assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
        })),
        charges: {
          taxPercent: Number(compact.c?.[0]) || 0,
          servicePercent: Number(compact.c?.[1]) || 0,
          discountPercent: Number(compact.c?.[2]) || 0,
          discountAmount: Number(compact.c?.[3]) || 0,
          actualTotal: Number(compact.c?.[4]) || 0,
        },
      };
    } catch (e) {
      console.warn('Gagal decode share link:', e);
      return null;
    }
  },

  buildUrl(state) {
    const encoded = this.encode(state);
    const base = window.location.origin + window.location.pathname;
    return `${base}#b=${encoded}`;
  },

  // Check the URL hash for a shared bill and return it (or null)
  readFromHash() {
    const hash = window.location.hash || '';
    const m = hash.match(/[#&]b=([^&]+)/);
    if (!m) return null;
    return this.decode(m[1]);
  },

  clearHash() {
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  },

  // Copy text to clipboard. Returns true on success.
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.warn('Clipboard API gagal, fallback ke textarea:', e);
    }
    // Fallback for file:// or non-HTTPS contexts
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  },
};
