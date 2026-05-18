// UI rendering — keeps DOM in sync with State.current

const UI = {
  // Modal currently editing an item (null = adding new)
  editingItemId: null,

  renderAll() {
    this.renderMeta();
    this.renderPeople();
    this.renderItems();
    this.renderCharges();
    this.renderSummary();
  },

  renderMeta() {
    const s = State.current;
    const titleEl = document.getElementById('bill-title');
    const dateEl = document.getElementById('bill-date');
    if (titleEl && titleEl.value !== s.title) titleEl.value = s.title || '';
    if (dateEl && dateEl.value !== s.date) dateEl.value = s.date || '';
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
      <div class="group bg-slate-100 hover:bg-slate-200 rounded-full pl-3 pr-1 py-1 flex items-center gap-2 transition">
        <span class="text-sm font-medium text-slate-700">${Utils.escapeHtml(p.name)}</span>
        <button data-action="remove-person" data-id="${p.id}"
          class="w-6 h-6 rounded-full bg-white hover:bg-rose-500 hover:text-white text-slate-400 text-xs flex items-center justify-center transition"
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
        : people.map(p => p.id); // shared
      const assignedNames = assigned.map(pid => {
        const p = people.find(x => x.id === pid);
        return p ? p.name : '?';
      });
      const isShared = !item.assignedTo || item.assignedTo.length === 0;

      return `
        <div class="border border-slate-200 rounded-xl p-3 hover:border-brand-300 transition bg-white">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="font-medium text-slate-800 truncate">${Utils.escapeHtml(item.name)}</div>
              <div class="text-xs text-slate-500 mt-0.5">
                ${item.qty > 1 ? `${item.qty} × ${Utils.rupiah(item.price)} = ` : ''}<strong class="text-slate-700">${Utils.rupiah(subtotal)}</strong>
              </div>
              <div class="mt-2 flex flex-wrap gap-1 items-center">
                ${isShared && people.length > 0
                  ? `<span class="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">🤝 Dibagi rata (semua)</span>`
                  : assignedNames.map(n => `<span class="text-xs bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full">${Utils.escapeHtml(n)}</span>`).join('')
                }
                ${people.length === 0 ? `<span class="text-xs text-rose-600 italic">⚠️ Belum ada orang</span>` : ''}
              </div>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
              <button data-action="edit-item" data-id="${item.id}"
                class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-brand-100 hover:text-brand-700 text-slate-600 text-sm transition" title="Edit">✏️</button>
              <button data-action="remove-item" data-id="${item.id}"
                class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-600 text-sm transition" title="Hapus">🗑️</button>
            </div>
          </div>
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
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) {
        el.value = val ? val : '';
      }
    });
  },

  renderSummary() {
    const totals = document.getElementById('summary-totals');
    const perPersonEl = document.getElementById('summary-per-person');
    const empty = document.getElementById('summary-empty');

    const s = State.current;
    if (s.people.length === 0 || s.items.length === 0) {
      totals.innerHTML = '';
      perPersonEl.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    const result = Calculator.compute(s);

    totals.innerHTML = `
      <div class="flex justify-between text-slate-600"><span>Subtotal</span><span>${Utils.rupiah(result.grand.subtotal)}</span></div>
      ${result.grand.discount > 0 ? `<div class="flex justify-between text-emerald-700"><span>Diskon</span><span>−${Utils.rupiah(result.grand.discount)}</span></div>` : ''}
      ${result.grand.service > 0 ? `<div class="flex justify-between text-slate-600"><span>Service Charge</span><span>${Utils.rupiah(result.grand.service)}</span></div>` : ''}
      ${result.grand.tax > 0 ? `<div class="flex justify-between text-slate-600"><span>Pajak</span><span>${Utils.rupiah(result.grand.tax)}</span></div>` : ''}
      <div class="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-200 mt-1.5">
        <span>Total</span><span class="text-brand-700">${Utils.rupiah(result.grand.total)}</span>
      </div>
    `;

    perPersonEl.innerHTML = result.perPerson.map(p => {
      const itemRows = p.items.map(it => `
        <div class="flex justify-between text-xs text-slate-500 py-0.5">
          <span class="truncate pr-2">
            ${Utils.escapeHtml(it.name)}
            ${it.splitCount > 1 ? `<span class="text-slate-400">(÷${it.splitCount})</span>` : ''}
          </span>
          <span class="shrink-0">${Utils.rupiah(it.share)}</span>
        </div>
      `).join('');

      return `
        <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div class="flex items-center justify-between mb-2">
            <div class="font-semibold text-slate-800 flex items-center gap-2">
              <span class="w-7 h-7 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold">${p.name.slice(0,1).toUpperCase()}</span>
              ${Utils.escapeHtml(p.name)}
            </div>
            <div class="text-right">
              <div class="text-lg font-bold text-brand-700">${Utils.rupiah(p.total)}</div>
            </div>
          </div>
          <details class="text-sm">
            <summary class="cursor-pointer text-xs text-slate-500 hover:text-brand-600 select-none">📋 Rincian</summary>
            <div class="mt-2 pl-1 space-y-0.5">
              ${itemRows || '<div class="text-xs italic text-slate-400">Belum ada item.</div>'}
              <div class="flex justify-between text-xs pt-1.5 mt-1.5 border-t border-slate-100">
                <span class="text-slate-500">Subtotal</span><span class="text-slate-700">${Utils.rupiah(p.subtotal)}</span>
              </div>
              ${p.discount > 0 ? `<div class="flex justify-between text-xs text-emerald-700"><span>Diskon</span><span>−${Utils.rupiah(p.discount)}</span></div>` : ''}
              ${p.service > 0 ? `<div class="flex justify-between text-xs text-slate-500"><span>Service</span><span>${Utils.rupiah(p.service)}</span></div>` : ''}
              ${p.tax > 0 ? `<div class="flex justify-between text-xs text-slate-500"><span>Pajak</span><span>${Utils.rupiah(p.tax)}</span></div>` : ''}
            </div>
          </details>
        </div>
      `;
    }).join('');
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

    if (itemId) {
      const item = State.current.items.find(i => i.id === itemId);
      if (!item) return;
      titleEl.textContent = 'Edit Barang';
      nameEl.value = item.name || '';
      priceEl.value = item.price || '';
      qtyEl.value = item.qty || 1;
      this._renderAssignees(item.assignedTo);
    } else {
      titleEl.textContent = 'Tambah Barang';
      nameEl.value = '';
      priceEl.value = '';
      qtyEl.value = 1;
      this._renderAssignees([]);
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
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-slate-700 border-slate-300 hover:border-brand-400 hover:text-brand-700'
          }">
          ${active ? '✓ ' : ''}${Utils.escapeHtml(p.name)}
        </button>
      `;
    }).join('');
  },

  closeModals() {
    document.querySelectorAll('#modal-item, #modal-history').forEach(m => {
      m.classList.add('hidden');
      m.classList.remove('flex');
    });
    this.editingItemId = null;
  },

  getModalItemSelectedAssignees() {
    const buttons = document.querySelectorAll('#item-assignees .assignee-chip');
    const selected = [];
    buttons.forEach(b => {
      if (b.classList.contains('bg-brand-600')) {
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
          <div class="text-slate-500 text-sm">Belum ada riwayat tersimpan.</div>
          <div class="text-xs text-slate-400 mt-1">Klik "Simpan ke Riwayat" untuk menyimpan tagihan saat ini.</div>
        </div>
      `;
    } else {
      list.innerHTML = history.map(b => {
        const total = Calculator.compute(b).grand.total;
        return `
          <div class="border border-slate-200 rounded-xl p-3 hover:border-brand-300 transition flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="font-medium text-slate-800 truncate">${Utils.escapeHtml(b.title || '(Tanpa judul)')}</div>
              <div class="text-xs text-slate-500 mt-0.5">
                ${Utils.formatDate(b.date)} • ${b.people.length} orang • ${b.items.length} item
              </div>
              <div class="text-sm font-semibold text-brand-700 mt-1">${Utils.rupiah(total)}</div>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
              <button data-action="load-history" data-id="${b.id}"
                class="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium transition">Buka</button>
              <button data-action="delete-history" data-id="${b.id}"
                class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-rose-500 hover:text-white text-slate-600 text-xs font-medium transition">Hapus</button>
            </div>
          </div>
        `;
      }).join('');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  // ---- OCR status ----
  showOCRStatus(html, type = 'info') {
    const el = document.getElementById('ocr-status');
    el.classList.remove('hidden');
    const colors = {
      info: 'bg-brand-50 text-brand-800 border-brand-200',
      success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      error: 'bg-rose-50 text-rose-800 border-rose-200',
    };
    el.className = `mt-3 text-sm border rounded-lg p-3 ${colors[type] || colors.info}`;
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
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-semibold text-slate-700">${items.length} item ditemukan</div>
          <button id="ocr-add-all" class="text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg font-medium transition">+ Tambah Semua</button>
        </div>
        <div class="space-y-1 max-h-60 overflow-y-auto">
          ${items.map((it, idx) => `
            <div class="flex items-center justify-between text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5">
              <span class="truncate pr-2">
                ${it.qty > 1 ? `<span class="text-xs text-slate-500">${it.qty}× </span>` : ''}
                ${Utils.escapeHtml(it.name)}
              </span>
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-xs text-slate-700 font-medium">${Utils.rupiah(it.price * it.qty)}</span>
                <button data-action="ocr-add-one" data-idx="${idx}"
                  class="w-6 h-6 rounded bg-brand-100 hover:bg-brand-600 hover:text-white text-brand-700 text-sm font-bold transition flex items-center justify-center" title="Tambah">+</button>
              </div>
            </div>
          `).join('')}
        </div>
        <p class="text-xs text-slate-500 italic mt-2">Klik + buat tambah satu per satu, atau "Tambah Semua".</p>
      </div>
    `;
  },
};
