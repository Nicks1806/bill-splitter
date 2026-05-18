// App entry — wires DOM events to State and UI

(function () {
  let ocrResult = null; // last OCR result for "add all" / "add one"

  function render() {
    UI.renderAll();
  }

  // ---- Init ----
  function init() {
    // Priority: share link in URL > saved draft > new bill
    const shared = Share.readFromHash();
    if (shared) {
      State.loadFromObject(shared);
      Share.clearHash();
      Utils.toast('📥 Tagihan dari link berhasil dibuka', 'success');
    } else if (!State.loadDraft()) {
      State.newBill();
    }
    render();
    bindEvents();
  }

  // ---- Event bindings ----
  function bindEvents() {
    // Bill meta
    document.getElementById('bill-title').addEventListener('input', (e) => {
      State.updateMeta({ title: e.target.value });
    });
    document.getElementById('bill-date').addEventListener('input', (e) => {
      State.updateMeta({ date: e.target.value });
    });

    // People
    const personInput = document.getElementById('person-input');
    const addPerson = () => {
      const name = personInput.value.trim();
      if (!name) return;
      State.addPerson(name);
      personInput.value = '';
      personInput.focus();
      render();
    };
    document.getElementById('add-person').addEventListener('click', addPerson);
    personInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addPerson(); }
    });

    // Delegate clicks on people list (remove person)
    document.getElementById('people-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="remove-person"]');
      if (!btn) return;
      State.removePerson(btn.getAttribute('data-id'));
      render();
    });

    // Items
    document.getElementById('add-item').addEventListener('click', () => {
      UI.openItemModal(null);
    });

    // Delegate clicks on items list
    document.getElementById('items-list').addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-action="edit-item"]');
      const delBtn = e.target.closest('[data-action="remove-item"]');
      if (editBtn) {
        UI.openItemModal(editBtn.getAttribute('data-id'));
      } else if (delBtn) {
        if (confirm('Hapus barang ini?')) {
          State.removeItem(delBtn.getAttribute('data-id'));
          render();
        }
      }
    });

    // Modal: item save
    document.getElementById('item-save').addEventListener('click', () => {
      const name = document.getElementById('item-name').value.trim();
      const price = Utils.parseNumber(document.getElementById('item-price').value);
      const qty = Math.max(1, parseInt(document.getElementById('item-qty').value, 10) || 1);
      const assignedTo = UI.getModalItemSelectedAssignees();

      if (!name) { Utils.toast('Nama barang masih kosong', 'error'); return; }
      if (price <= 0) { Utils.toast('Harga harus lebih dari 0', 'error'); return; }

      if (UI.editingItemId) {
        State.updateItem(UI.editingItemId, { name, price, qty, assignedTo });
        Utils.toast('Barang diupdate', 'success');
      } else {
        State.addItem({ name, price, qty, assignedTo });
        Utils.toast('Barang ditambah', 'success');
      }
      UI.closeModals();
      render();
    });

    // Modal: assignee chip toggles
    document.getElementById('item-assignees').addEventListener('click', (e) => {
      const chip = e.target.closest('.assignee-chip');
      if (!chip) return;
      const isActive = chip.classList.contains('bg-brand-600');
      if (isActive) {
        chip.classList.remove('bg-brand-600', 'text-white', 'border-brand-600');
        chip.classList.add('bg-white', 'text-slate-700', 'border-slate-300');
        chip.textContent = chip.textContent.replace(/^✓\s*/, '');
      } else {
        chip.classList.add('bg-brand-600', 'text-white', 'border-brand-600');
        chip.classList.remove('bg-white', 'text-slate-700', 'border-slate-300');
        if (!chip.textContent.startsWith('✓')) chip.textContent = '✓ ' + chip.textContent;
      }
    });

    // Generic modal close (close button + click outside)
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModals());
    });
    document.querySelectorAll('#modal-item, #modal-history').forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) UI.closeModals();
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') UI.closeModals();
    });

    // Charges
    const chargeFields = [
      ['tax-percent', 'taxPercent'],
      ['service-percent', 'servicePercent'],
      ['discount-percent', 'discountPercent'],
      ['discount-amount', 'discountAmount'],
    ];
    chargeFields.forEach(([id, key]) => {
      const el = document.getElementById(id);
      const handler = Utils.debounce(() => {
        State.updateCharges({ [key]: Utils.parseNumber(el.value) });
        UI.renderSummary();
      }, 150);
      el.addEventListener('input', handler);
    });

    // Share
    document.getElementById('btn-share').addEventListener('click', async () => {
      const s = State.current;
      if (s.people.length === 0 && s.items.length === 0) {
        Utils.toast('Belum ada apa-apa buat di-share', 'error');
        return;
      }
      const url = Share.buildUrl(s);
      const ok = await Share.copyToClipboard(url);
      if (ok) {
        Utils.toast('🔗 Link tersalin! Tinggal paste ke chat.', 'success');
      } else {
        prompt('Link share (copy manual):', url);
      }
    });

    // Save to history
    document.getElementById('btn-save').addEventListener('click', () => {
      const s = State.current;
      if (s.people.length === 0 || s.items.length === 0) {
        Utils.toast('Tambah orang & barang dulu', 'error');
        return;
      }
      State.saveToHistory();
      Utils.toast('💾 Tersimpan ke riwayat', 'success');
    });

    // History modal
    document.getElementById('btn-history').addEventListener('click', () => {
      UI.openHistoryModal();
    });
    document.getElementById('history-list').addEventListener('click', (e) => {
      const loadBtn = e.target.closest('[data-action="load-history"]');
      const delBtn = e.target.closest('[data-action="delete-history"]');
      if (loadBtn) {
        State.loadFromHistory(loadBtn.getAttribute('data-id'));
        UI.closeModals();
        render();
        Utils.toast('Tagihan dimuat dari riwayat', 'success');
      } else if (delBtn) {
        if (confirm('Hapus dari riwayat?')) {
          State.deleteFromHistory(delBtn.getAttribute('data-id'));
          UI.openHistoryModal();
        }
      }
    });

    // Reset
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (State.current.people.length > 0 || State.current.items.length > 0) {
        if (!confirm('Mulai tagihan baru? Data saat ini akan terhapus (kecuali yang sudah disimpan ke riwayat).')) return;
      }
      State.newBill();
      render();
      ocrResult = null;
      UI.hideOCRStatus();
      document.getElementById('ocr-preview').classList.add('hidden');
      Utils.toast('Tagihan baru dimulai', 'info');
    });

    // OCR
    document.getElementById('receipt-file').addEventListener('change', handleOCRFile);

    // OCR preview actions
    document.getElementById('ocr-preview').addEventListener('click', (e) => {
      const addAll = e.target.closest('#ocr-add-all');
      const addOne = e.target.closest('[data-action="ocr-add-one"]');
      if (addAll && ocrResult) {
        ocrResult.items.forEach(it => State.addItem({ ...it, assignedTo: [] }));
        Utils.toast(`${ocrResult.items.length} item ditambah`, 'success');
        document.getElementById('ocr-preview').classList.add('hidden');
        render();
      } else if (addOne && ocrResult) {
        const idx = parseInt(addOne.getAttribute('data-idx'), 10);
        const it = ocrResult.items[idx];
        if (it) {
          State.addItem({ ...it, assignedTo: [] });
          Utils.toast(`"${it.name}" ditambah`, 'success');
          render();
        }
      }
    });
  }

  // ---- OCR handler ----
  async function handleOCRFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-selected

    UI.showOCRStatus(`
      <div class="flex items-center gap-3">
        <div class="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full"></div>
        <div>
          <div class="font-medium">Membaca struk...</div>
          <div id="ocr-progress" class="text-xs opacity-75">Memulai...</div>
        </div>
      </div>
    `, 'info');

    try {
      const result = await OCR.runOnFile(file, (msg) => {
        const progressEl = document.getElementById('ocr-progress');
        if (progressEl && msg.status) {
          const pct = msg.progress ? ` (${Math.round(msg.progress * 100)}%)` : '';
          progressEl.textContent = `${msg.status}${pct}`;
        }
      });

      ocrResult = result;

      // Apply detected tax/service if found and current values are 0
      if (result.meta) {
        const patch = {};
        if (result.meta.taxPercent && !State.current.charges.taxPercent) {
          patch.taxPercent = result.meta.taxPercent;
        }
        if (result.meta.servicePercent && !State.current.charges.servicePercent) {
          patch.servicePercent = result.meta.servicePercent;
        }
        if (Object.keys(patch).length > 0) {
          State.updateCharges(patch);
          UI.renderCharges();
          UI.renderSummary();
        }
      }

      if (result.items.length === 0) {
        UI.showOCRStatus(`
          <div class="font-medium">⚠️ Belum ada item yang kebaca otomatis</div>
          <div class="text-xs mt-1">Coba foto yang lebih jelas, atau tambahin manual aja.</div>
        `, 'error');
        document.getElementById('ocr-preview').classList.add('hidden');
      } else {
        UI.showOCRStatus(`
          <div class="font-medium">✅ Selesai! Cek hasilnya di bawah.</div>
          <div class="text-xs mt-1">Edit dulu kalau ada yang salah sebelum ditambah.</div>
        `, 'success');
        UI.showOCRPreview(result.items);
      }
    } catch (err) {
      console.error(err);
      UI.showOCRStatus(`
        <div class="font-medium">❌ Gagal baca struk</div>
        <div class="text-xs mt-1">${Utils.escapeHtml(err.message || 'Error tidak diketahui')}</div>
      `, 'error');
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
