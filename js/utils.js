// Helper utilities

const Utils = {
  // Generate short random ID
  uid(prefix = 'x') {
    return prefix + '_' + Math.random().toString(36).slice(2, 9);
  },

  // Format number to Indonesian Rupiah
  rupiah(n) {
    if (n === null || n === undefined || isNaN(n)) return 'Rp 0';
    const rounded = Math.round(n);
    return 'Rp ' + rounded.toLocaleString('id-ID');
  },

  // Format number without "Rp" prefix (for inputs)
  formatNumber(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('id-ID');
  },

  // Parse user-entered number (handles "25.000", "25,000", "25000")
  parseNumber(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    // Remove anything that's not a digit, comma, dot, or minus
    const cleaned = String(str).replace(/[^\d.,-]/g, '');
    // Treat both . and , as thousand separator (Indonesian convention)
    const digits = cleaned.replace(/[.,]/g, '');
    const n = parseFloat(digits);
    return isNaN(n) ? 0 : n;
  },

  // Today as YYYY-MM-DD
  todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  // Friendly date label
  formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return isoStr;
    }
  },

  // Debounce helper
  debounce(fn, wait = 200) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  },

  // Escape HTML to prevent XSS when injecting user-provided strings
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Show toast notification
  toast(message, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('bg-slate-900', 'bg-emerald-600', 'bg-rose-600');
    if (type === 'success') el.classList.add('bg-emerald-600');
    else if (type === 'error') el.classList.add('bg-rose-600');
    else el.classList.add('bg-slate-900');
    el.classList.remove('opacity-0', 'translate-y-2', 'pointer-events-none');
    el.classList.add('opacity-100', 'translate-y-0');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
      el.classList.remove('opacity-100', 'translate-y-0');
    }, 2400);
  },
};
