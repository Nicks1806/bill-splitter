// App entry — wires DOM events to State and UI

(function () {
  let ocrResult = null; // last OCR result for "add all" / "add one"

  function render() {
    UI.renderAll();
  }

  // ---- Init ----
  function init() {
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
    document.getElementById('bill-note').addEventListener('input', (e) => {
      State.updateMeta({ note: e.target.value });
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

    // Click anywhere on the row → edit modal
    document.getElementById('items-list').addEventListener('click', (e) => {
      const row = e.target.closest('[data-action="edit-item"]');
      if (row) UI.openItemModal(row.getAttribute('data-id'));
    });

    // Modal: item save
    document.getElementById('item-save').addEventListener('click', () => {
      const name = document.getElementById('item-name').value.trim();
      const price = Utils.parseNumber(document.getElementById('item-price').value);
      const qty = Math.max(1, parseInt(document.getElementById('item-qty').value, 10) || 1);
      const assignedTo = UI.getModalItemSelectedAssignees();

      if (!name) { Utils.toast('Nama item masih kosong', 'error'); return; }
      if (price <= 0) { Utils.toast('Harga harus lebih dari 0', 'error'); return; }

      if (UI.editingItemId) {
        State.updateItem(UI.editingItemId, { name, price, qty, assignedTo });
        Utils.toast('Item diupdate', 'success');
      } else {
        State.addItem({ name, price, qty, assignedTo });
        Utils.toast('Item ditambah', 'success');
      }
      UI.closeModals();
      render();
    });

    // Modal: item delete (only visible in edit mode)
    document.getElementById('item-delete')?.addEventListener('click', () => {
      if (!UI.editingItemId) return;
      if (!confirm('Hapus item ini?')) return;
      State.removeItem(UI.editingItemId);
      UI.closeModals();
      render();
      Utils.toast('Item dihapus', 'info');
    });

    // Modal: assignee chip toggles
    document.getElementById('item-assignees').addEventListener('click', (e) => {
      const chip = e.target.closest('.assignee-chip');
      if (!chip) return;
      const isActive = chip.classList.contains('bg-brand-500');
      if (isActive) {
        chip.classList.remove('bg-brand-500', 'text-white', 'border-brand-500');
        chip.classList.add('bg-ink-900', 'text-ink-200', 'border-ink-700');
        chip.textContent = chip.textContent.replace(/^✓\s*/, '');
      } else {
        chip.classList.add('bg-brand-500', 'text-white', 'border-brand-500');
        chip.classList.remove('bg-ink-900', 'text-ink-200', 'border-ink-700');
        if (!chip.textContent.startsWith('✓')) chip.textContent = '✓ ' + chip.textContent;
      }
    });

    // Generic modal close
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModals());
    });
    document.querySelectorAll('#modal-item, #modal-history, #modal-receipt').forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) UI.closeModals();
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') UI.closeModals();
    });

    // Charges (incl. new actualTotal field)
    const chargeFields = [
      ['tax-percent', 'taxPercent'],
      ['service-percent', 'servicePercent'],
      ['discount-percent', 'discountPercent'],
      ['discount-amount', 'discountAmount'],
      ['actual-total', 'actualTotal'],
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
        Utils.toast('🔗 Link tersalin! Paste ke chat.', 'success');
      } else {
        prompt('Link share (copy manual):', url);
      }
    });

    // Save to history
    document.getElementById('btn-save').addEventListener('click', () => {
      const s = State.current;
      if (s.people.length === 0 || s.items.length === 0) {
        Utils.toast('Tambah orang & item dulu', 'error');
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
        UI.setReceiptPhoto(null);
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
      UI.setReceiptPhoto(null);
      UI.hideOCRStatus();
      document.getElementById('ocr-preview').classList.add('hidden');
      Utils.toast('Tagihan baru dimulai', 'info');
    });

    // OCR
    document.getElementById('receipt-file').addEventListener('change', handleOCRFile);

    // Receipt thumbnail → lightbox
    document.getElementById('receipt-thumb-btn')?.addEventListener('click', () => {
      UI.openReceiptLightbox();
    });

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
  const STATUS_LABELS = {
    'memuat gambar': 'Memuat gambar',
    'memproses gambar': 'Memproses gambar',
    'siap mengenali': 'Siap mengenali',
    'memproses gambar...': 'Memproses gambar',
    'loading tesseract core': 'Memuat engine OCR (~2MB)',
    'initializing tesseract': 'Init engine',
    'loading language traineddata': 'Download model bahasa (~10MB, sekali aja)',
    'initialized api': 'Engine siap',
    'initializing api': 'Init engine',
    'recognizing text': 'Membaca teks dari struk',
  };

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Gagal load foto'));
      reader.readAsDataURL(file);
    });
  }

  async function handleOCRFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Show thumbnail immediately
    try {
      const dataUrl = await fileToDataUrl(file);
      UI.setReceiptPhoto(dataUrl);
    } catch {}

    UI.showOCRStatus(`
      <div class="flex items-center gap-3">
        <div class="animate-spin w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full shrink-0"></div>
        <div class="min-w-0">
          <div class="font-medium">Membaca struk...</div>
          <div id="ocr-progress" class="text-xs opacity-75 truncate">Memulai...</div>
          <div class="text-xs opacity-60 mt-0.5">Pertama kali agak lama (~30 dtk), berikutnya cepat.</div>
        </div>
      </div>
    `, 'info');

    try {
      const result = await OCR.runOnFile(file, (msg) => {
        const progressEl = document.getElementById('ocr-progress');
        if (!progressEl || !msg.status) return;
        const label = STATUS_LABELS[msg.status] || msg.status;
        const pct = (msg.progress !== null && msg.progress !== undefined)
          ? ` ${Math.round(msg.progress * 100)}%`
          : '';
        progressEl.textContent = `${label}${pct}`;
      });

      ocrResult = result;

      const detected = [];
      if (result.meta) {
        const patch = {};
        if (result.meta.taxPercent && !State.current.charges.taxPercent) {
          patch.taxPercent = result.meta.taxPercent;
          detected.push(`Pajak ${result.meta.taxPercent}%`);
        }
        if (result.meta.servicePercent && !State.current.charges.servicePercent) {
          patch.servicePercent = result.meta.servicePercent;
          detected.push(`Servis ${result.meta.servicePercent}%`);
        }
        if (result.meta.discountPercent && !State.current.charges.discountPercent) {
          patch.discountPercent = result.meta.discountPercent;
          detected.push(`Diskon ${result.meta.discountPercent}%`);
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
          <div class="text-xs mt-1">Coba foto yang lebih jelas (tidak miring, pencahayaan cukup), atau tambahin manual.</div>
          ${result.rawText ? `<details class="mt-2"><summary class="text-xs cursor-pointer hover:underline">Lihat hasil mentah OCR</summary><pre class="text-[11px] mt-1 p-2 bg-black/30 rounded max-h-40 overflow-auto whitespace-pre-wrap">${Utils.escapeHtml(result.rawText)}</pre></details>` : ''}
        `, 'error');
        document.getElementById('ocr-preview').classList.add('hidden');
      } else {
        const detectedMsg = detected.length > 0
          ? `<div class="text-xs mt-1">🎯 Auto-detect: ${detected.join(' • ')}</div>`
          : '';
        UI.showOCRStatus(`
          <div class="font-medium">✅ Ketemu ${result.items.length} item</div>
          <div class="text-xs mt-1">Cek dulu, edit kalau salah sebelum ditambah.</div>
          ${detectedMsg}
          ${result.rawText ? `<details class="mt-2"><summary class="text-xs cursor-pointer hover:underline opacity-75">Lihat hasil mentah OCR (debug)</summary><pre class="text-[11px] mt-1 p-2 bg-black/30 rounded max-h-40 overflow-auto whitespace-pre-wrap">${Utils.escapeHtml(result.rawText)}</pre></details>` : ''}
        `, 'success');
        UI.showOCRPreview(result.items);
      }
    } catch (err) {
      console.error(err);
      UI.showOCRStatus(`
        <div class="font-medium">❌ Gagal baca struk</div>
        <div class="text-xs mt-1">${Utils.escapeHtml(err.message || 'Error tidak diketahui')}</div>
        <div class="text-xs mt-1 opacity-75">Coba refresh halaman lalu upload ulang.</div>
      `, 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
