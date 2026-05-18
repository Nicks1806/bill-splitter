// UI rendering — keeps DOM in sync with State.current

const UI = {
  editingItemId: null,
  receiptDataUrl: null, // in-memory only (not persisted)

  renderAll() {
    this.renderMeta();
    this.renderPeople();
    this.renderItems();
    this.renderCharges();
    this.renderSummary();
  },

  renderMeta() {
    const s = State.current;
    const setIfDifferent = (id, val) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el && el.value !== (val || '')) el.value = val || '';
    };
    setIfDifferent('bill-title', s.title);
    setIfDifferent('bill-date', s.date);
    setIfDifferent('bill-note', s.note);
  },

  renderPeople() {
    const list = document.getElementById('people-list');
    const empty = document.getElementById('people-empty');
    const count = document.getElementById('people-count');
    const people = State.current.people;

    count.textContent = `${people.length} orang`;

    if (people.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    list.innerHTML = people.map(p => `
      <div class="group bg-ink-800 hover:bg-ink-700 rounded-full pl-3 pr-1 py-1 flex items-center gap-2 transition border border-ink-700">
        <span class="text-sm font-medium text-ink-100">${Utils.escapeHtml(p.name)}</span>
        <button data-action="remove-person" data-id="${p.id}"
          class="w-6 h-6 rounded-full bg-ink-900 hover:bg-rose-500 hover:text-white text-ink-500 text-xs flex items-center justify-center transition"
          title="Hapus">×</button>
      </div>
    `).join('');
  },

  renderItems() {
    const list = document.getElementById('items-list');
    const empty = document.getElementById('items-empty');
    const count = document.getElementById('items-count');
    const items = State.current.items;
    const people = State.current.people;

    count.textContent = `${items.length} item`;

    if (items.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    list.innerHTML = items.map(item => {
      const subtotal = (item.price || 0) * (item.qty || 1);
      const assigned = (item.assignedTo && item.assignedTo.length > 0)
        ? item.assignedTo
        : people.map(p => p.id);
      const assignedNames = assigned.map(pid => {
        const p = people.find(x => x.id === pid);
        return p ? p.name : '?';
      });
      const isShared = !item.assignedTo || item.assignedTo.length === 0;

      const metaPills = people.length === 0
        ? `<span class="text-[10px] text-rose-400 italic">⚠️ Belum ada orang</span>`
        : (isShared
            ? `<span class="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">🤝 Bagi rata semua</span>`
            : assignedNames.map(n => `<span class="text-[10px] bg-brand-500/15 text-brand-400 px-2 py-0.5 rounded-full font-medium">${Utils.escapeHtml(n)}</span>`).join('')
          );

      return `
        <div class="item-row" data-action="edit-item" data-id="${item.id}">
          <div class="item-name">${Utils.escapeHtml(item.name)}</div>
          <div class="item-qty">x${item.qty || 1}</div>
          <div class="item-price">${Utils.formatNumber(subtotal)}</div>
          <div class="item-meta">${metaPills}</div>
        </div>
      `;
    }).join('');
  },

  renderCharges() {
    const c = State.current.charges;
    const fields = {
      'tax-percent': c.taxPercent,
      'service-percent': c.servicePercent,
      'discount-percent': c.discountPercent,
      'discount-amount': c.discountAmount,
      'actual-total': c.actualTotal,
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) {
        el.value = val ? val : '';
      }
    });
  },

  renderSummary() {
    const s = State.current;
    const rincianItems = document.getElementById('rincian-items');
    const totalsEl = document.getElementById('summary-totals');
    const perPersonEl = document.getElementById('summary-per-person');
    const empty = document.getElementById('summary-empty');

    if (s.items.length === 0) {
      rincianItems.innerHTML = `<p class="text-sm text-ink-500 italic py-2">Belum ada item.</p>`;
    } else {
      // Gojek-style item rows (read-only repeat for context)
      rincianItems.innerHTML = s.items.map(item => {
        const subtotal = (item.price || 0) * (item.qty || 1);
        return `
          <div class="flex items-center gap-3 py-2 border-b border-dashed border-ink-800 last:border-b-0">
            <div class="flex-1 min-w-0 text-sm font-semibold uppercase tracking-wide text-ink-100 truncate">${Utils.escapeHtml(item.name)}</div>
            <div class="text-xs text-ink-400 bg-ink-800 px-2 py-0.5 rounded-full">x${item.qty || 1}</div>
            <div class="text-sm font-bold text-ink-100 tabular-nums whitespace-nowrap">${Utils.formatNumber(subtotal)}</div>
          </div>
        `;
      }).join('');
    }

    if (s.people.length === 0 || s.items.length === 0) {
      totalsEl.innerHTML = '';
      perPersonEl.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    const result = Calculator.compute(s);
    const g = result.grand;

    // Build summary rows
    const rows = [];
    rows.push(`<div class="summary-row"><span>Subtotal</span><span class="tabular-nums font-medium">${Utils.formatNumber(g.subtotal)}</span></div>`);
    rows.push(`<div class="summary-row"><span>Pajak</span><span class="tabular-nums font-medium">${Utils.formatNumber(g.tax)}</span></div>`);
    rows.push(`<div class="summary-row"><span>Servis</span><span class="tabular-nums font-medium">${Utils.formatNumber(g.service)}</span></div>`);
    rows.push(`<div class="summary-row ${g.discount > 0 ? 'discount' : ''}"><span>Diskon</span><span class="tabular-nums font-medium">${g.discount > 0 ? '−' : ''}${Utils.formatNumber(g.discount)}</span></div>`);

    if (g.hasActualTotal) {
      const showWarn = Math.abs(g.other) >= 100; // > Rp100 = warn user
      const sign = g.other < 0 ? '−' : (g.other > 0 ? '+' : '');
      rows.push(`
        <div class="summary-row ${showWarn ? 'warn-bg' : ''}">
          <span class="flex items-center gap-1.5">
            Lainnya
            ${showWarn ? '<span class="text-[10px]" title="Selisih cukup besar — cek lagi">⚠️</span>' : ''}
          </span>
          <span class="tabular-nums font-medium">${sign}${Utils.formatNumber(Math.abs(g.other))}</span>
        </div>
        ${showWarn ? `<p class="text-[11px] text-amber-400 -mt-1 px-1">Pastiin jumlah ini udah benar (bisa biaya kemasan, rounding, dll).</p>` : ''}
      `);
    }
    rows.push(`<div class="summary-row total"><span>Jumlah total</span><span class="tabular-nums text-brand-400">Rp ${Utils.formatNumber(g.total)}</span></div>`);

    totalsEl.innerHTML = rows.join('');

    // Per-person — Gojek-inspired clean card style
    perPersonEl.innerHTML = result.perPerson.map(p => {
      const itemRows = p.items.map(it => `
        <div class="flex justify-between text-[11px] text-ink-400 py-0.5">
          <span class="truncate pr-2">
            ${Utils.escapeHtml(it.name)}${it.splitCount > 1 ? `<span class="text-ink-500"> (÷${it.splitCount})</span>` : ''}
          </span>
          <span class="shrink-0 tabular-nums">${Utils.formatNumber(it.share)}</span>
        </div>
      `).join('');

      return `
        <div class="bg-ink-900 rounded-xl p-3 border border-ink-800">
          <div class="flex items-center justify-between mb-1">
            <div class="font-semibold text-ink-100 flex items-center gap-2 min-w-0">
              <span class="w-7 h-7 bg-brand-500/20 text-brand-400 rounded-full flex items-center justify-center text-xs font-bold shrink-0">${p.name.slice(0,1).toUpperCase()}</span>
              <span class="truncate">${Utils.escapeHtml(p.name)}</span>
            </div>
            <div class="text-base font-bold text-brand-400 tabular-nums whitespace-nowrap">Rp ${Utils.formatNumber(p.total)}</div>
          </div>
          <details>
            <summary class="text-[11px] text-ink-500 hover:text-brand-400 select-none mt-1">📋 Rincian</summary>
            <div class="mt-2 pl-1 space-y-0.5 text-[11px]">
              ${itemRows || '<div class="italic text-ink-500">Belum ada item.</div>'}
              <div class="flex justify-between pt-1.5 mt-1.5 border-t border-ink-800 text-ink-400">
                <span>Subtotal</span><span class="tabular-nums">${Utils.formatNumber(p.subtotal)}</span>
              </div>
              ${p.discount > 0 ? `<div class="flex justify-between text-emerald-400"><span>Diskon</span><span class="tabular-nums">−${Utils.formatNumber(p.discount)}</span></div>` : ''}
              ${p.service > 0 ? `<div class="flex justify-between text-ink-400"><span>Servis</span><span class="tabular-nums">${Utils.formatNumber(p.service)}</span></div>` : ''}
              ${p.tax > 0 ? `<div class="flex justify-between text-ink-400"><span>Pajak</span><span class="tabular-nums">${Utils.formatNumber(p.tax)}</span></div>` : ''}
              ${Math.abs(p.other) > 0 ? `<div class="flex justify-between text-amber-400"><span>Lainnya</span><span class="tabular-nums">${p.other < 0 ? '−' : '+'}${Utils.formatNumber(Math.abs(p.other))}</span></div>` : ''}
            </div>
          </details>
        </div>
      `;
    }).join('');
  },

  // ---- Receipt photo state ----
  setReceiptPhoto(dataUrl) {
    this.receiptDataUrl = dataUrl;
    const empty = document.getElementById('scan-empty');
    const done = document.getElementById('scan-done');
    const thumb = document.getElementById('receipt-thumb');
    if (dataUrl) {
      empty.classList.add('hidden');
      done.classList.remove('hidden');
      if (thumb) thumb.src = dataUrl;
    } else {
      empty.classList.remove('hidden');
      done.classList.add('hidden');
    }
  },

  openReceiptLightbox() {
    if (!this.receiptDataUrl) return;
    const modal = document.getElementById('modal-receipt');
    const img = document.getElementById('receipt-full');
    img.src = this.receiptDataUrl;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  // ---- Item modal ----
  openItemModal(itemId = null) {
    this.editingItemId = itemId;
    const modal = document.getElementById('modal-item');
    const titleEl = document.getElementById('modal-item-title');
    const nameEl = document.getElementById('item-name');
    const priceEl = document.getElementById('item-price');
    const qtyEl = document.getElementById('item-qty');
    const assigneesEl = document.getElementById('item-assignees');
    const assigneesEmpty = document.getElementById('item-assignees-empty');
    const people = State.current.people;

    const deleteBtn = document.getElementById('item-delete');
    if (itemId) {
      const item = State.current.items.find(i => i.id === itemId);
      if (!item) return;
      titleEl.textContent = 'Edit Item';
      nameEl.value = item.name || '';
      priceEl.value = item.price || '';
      qtyEl.value = item.qty || 1;
      this._renderAssignees(item.assignedTo);
      if (deleteBtn) deleteBtn.classList.remove('hidden');
    } else {
      titleEl.textContent = 'Tambah Item';
      nameEl.value = '';
      priceEl.value = '';
      qtyEl.value = 1;
      this._renderAssignees([]);
      if (deleteBtn) deleteBtn.classList.add('hidden');
    }

    if (people.length === 0) {
      assigneesEl.classList.add('hidden');
      assigneesEmpty.classList.remove('hidden');
    } else {
      assigneesEl.classList.remove('hidden');
      assigneesEmpty.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => nameEl.focus(), 50);
  },

  _renderAssignees(selected) {
    const el = document.getElementById('item-assignees');
    const people = State.current.people;
    const sel = new Set(selected || []);
    el.innerHTML = people.map(p => {
      const active = sel.has(p.id);
      return `
        <button type="button" data-assignee="${p.id}"
          class="assignee-chip px-3 py-1.5 rounded-full text-sm font-medium border transition ${
            active
              ? 'bg-brand-500 text-white border-brand-500'
              : 'bg-ink-900 text-ink-200 border-ink-700 hover:border-brand-500 hover:text-brand-400'
          }">
          ${active ? '✓ ' : ''}${Utils.escapeHtml(p.name)}
        </button>
      `;
    }).join('');
  },

  closeModals() {
    document.querySelectorAll('#modal-item, #modal-history, #modal-receipt').forEach(m => {
      m.classList.add('hidden');
      m.classList.remove('flex');
    });
    this.editingItemId = null;
  },

  getModalItemSelectedAssignees() {
    const buttons = document.querySelectorAll('#item-assignees .assignee-chip');
    const selected = [];
    buttons.forEach(b => {
      if (b.classList.contains('bg-brand-500')) {
        selected.push(b.getAttribute('data-assignee'));
      }
    });
    return selected;
  },

  // ---- History modal ----
  openHistoryModal() {
    const modal = document.getElementById('modal-history');
    const list = document.getElementById('history-list');
    const history = State.getHistory();

    if (history.length === 0) {
      list.innerHTML = `
        <div class="text-center py-10">
          <div class="text-4xl mb-2">📭</div>
          <div class="text-ink-400 text-sm">Belum ada riwayat tersimpan.</div>
          <div class="text-xs text-ink-500 mt-1">Klik 💾 untuk menyimpan tagihan saat ini.</div>
        </div>
      `;
    } else {
      list.innerHTML = history.map(b => {
        const total = Calculator.compute(b).grand.total;
        return `
          <div class="border border-ink-800 bg-ink-900 rounded-xl p-3 hover:border-brand-500/50 transition flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-ink-100 truncate uppercase tracking-wide text-sm">${Utils.escapeHtml(b.title || '(Tanpa judul)')}</div>
              <div class="text-xs text-ink-400 mt-0.5">
                ${Utils.formatDate(b.date)} • ${b.people.length} orang • ${b.items.length} item
              </div>
              <div class="text-sm font-bold text-brand-400 mt-1 tabular-nums">Rp ${Utils.formatNumber(total)}</div>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
              <button data-action="load-history" data-id="${b.id}"
                class="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition">Buka</button>
              <button data-action="delete-history" data-id="${b.id}"
                class="px-3 py-1.5 rounded-lg bg-ink-800 hover:bg-rose-500 hover:text-white text-ink-400 text-xs font-medium transition">Hapus</button>
            </div>
          </div>
        `;
      }).join('');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  // ---- OCR status & preview ----
  showOCRStatus(html, type = 'info') {
    const el = document.getElementById('ocr-status');
    el.classList.remove('hidden');
    const styles = {
      info: 'bg-brand-500/10 text-brand-300 border-brand-500/30',
      success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      error: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    };
    el.className = `mt-3 text-sm border rounded-xl p-3 ${styles[type] || styles.info}`;
    el.innerHTML = html;
  },

  hideOCRStatus() {
    document.getElementById('ocr-status').classList.add('hidden');
  },

  showOCRPreview(items) {
    const el = document.getElementById('ocr-preview');
    if (!items || items.length === 0) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="bg-ink-900 border border-ink-800 rounded-xl p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-semibold text-ink-100">${items.length} item ditemukan</div>
          <button id="ocr-add-all" class="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg font-semibold transition">+ Tambah Semua</button>
        </div>
        <div class="space-y-1 max-h-60 overflow-y-auto">
          ${items.map((it, idx) => `
            <div class="flex items-center justify-between text-sm bg-ink-850 border border-ink-800 rounded-lg px-2 py-1.5">
              <span class="truncate pr-2 text-ink-200">
                ${it.qty > 1 ? `<span class="text-xs text-ink-500">${it.qty}× </span>` : ''}
                ${Utils.escapeHtml(it.name)}
              </span>
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-xs text-ink-300 font-medium tabular-nums">${Utils.formatNumber(it.price * it.qty)}</span>
                <button data-action="ocr-add-one" data-idx="${idx}"
                  class="w-6 h-6 rounded bg-brand-500/15 hover:bg-brand-500 hover:text-white text-brand-400 text-sm font-bold transition flex items-center justify-center" title="Tambah">+</button>
              </div>
            </div>
          `).join('')}
        </div>
        <p class="text-[11px] text-ink-500 italic mt-2">Klik + buat tambah satu-satu, atau "Tambah Semua".</p>
      </div>
    `;
  },
};
