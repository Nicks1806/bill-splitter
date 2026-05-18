// OCR receipt scanning via Tesseract.js
// Optimised for Indonesian receipts: preprocessing, smart parsing, amount-based tax detection.

const OCR = {
  _worker: null,
  _workerLang: null,

  // ---- Worker management (reused across uploads) ----
  async _getWorker(lang = 'ind', onProgress) {
    if (this._worker && this._workerLang === lang) return this._worker;
    if (this._worker) {
      try { await this._worker.terminate(); } catch {}
      this._worker = null;
    }
    if (!window.Tesseract) throw new Error('Library OCR belum siap. Coba refresh halaman.');

    const worker = await window.Tesseract.createWorker(lang, 1, {
      logger: msg => {
        if (typeof onProgress === 'function') onProgress(msg);
      },
    });
    // PSM 6 = single uniform block of text → matches receipt layout much better
    // than the default "auto" which over-segments price columns.
    await worker.setParameters({
      tessedit_pageseg_mode: window.Tesseract.PSM?.SINGLE_BLOCK ?? '6',
      preserve_interword_spaces: '1',
    });
    this._worker = worker;
    this._workerLang = lang;
    return worker;
  },

  // ---- Image preprocessing: grayscale, upscale small images, binarize ----
  async _preprocess(file, onProgress) {
    onProgress?.({ status: 'memuat gambar', progress: 0 });
    const img = await this._loadImage(file);

    // Upscale if too small — Tesseract works best with x-height ~30px (image width ~1200+).
    const targetMinWidth = 1400;
    const scale = img.width < targetMinWidth ? Math.min(3, targetMinWidth / img.width) : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    onProgress?.({ status: 'memproses gambar', progress: 0.5 });

    // Grayscale + contrast boost + simple threshold
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // Compute average luminance for adaptive threshold
    let lumaSum = 0;
    const lumaSampleStride = 4 * 16; // sample every 16th pixel
    for (let i = 0; i < d.length; i += lumaSampleStride) {
      lumaSum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const avgLuma = lumaSum / (d.length / lumaSampleStride);
    // Threshold a bit below average — preserves dark text, removes mid-tone noise
    const threshold = Math.max(120, Math.min(200, avgLuma - 20));

    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // Soft binarization: push dark→darker, light→white, keep some grey for AA
      let v;
      if (luma < threshold - 30) v = 0;
      else if (luma > threshold + 30) v = 255;
      else v = luma < threshold ? 60 : 200;
      d[i] = d[i + 1] = d[i + 2] = v;
      // d[i + 3] alpha unchanged
    }
    ctx.putImageData(imgData, 0, 0);

    onProgress?.({ status: 'siap mengenali', progress: 1 });
    return canvas;
  },

  _loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error('Gagal load gambar')); };
      img.src = url;
    });
  },

  // ---- Main entry ----
  async runOnFile(file, onProgress) {
    const reportPhase = (phase, status, progress) => {
      onProgress?.({ phase, status, progress: progress ?? null });
    };

    reportPhase('preprocess', 'memproses gambar...', 0);
    const canvas = await this._preprocess(file, (m) => {
      reportPhase('preprocess', m.status, m.progress);
    });

    reportPhase('worker', 'menyiapkan engine OCR...', 0);
    const worker = await this._getWorker('ind', (msg) => {
      // Tesseract emits status like "loading language traineddata", "initializing api", "recognizing text"
      reportPhase(msg.status || 'memuat', msg.status, msg.progress);
    });

    reportPhase('recognize', 'membaca teks dari struk...', 0);
    const result = await worker.recognize(canvas);
    const text = result?.data?.text || '';

    return {
      rawText: text,
      items: this.parseItems(text),
      meta: this.parseMeta(text),
    };
  },

  // ---- Smart parser ----
  // Handles three patterns:
  //   1. Single line:  "Nasi Goreng   25.000"
  //   2. Single line with qty: "2 Nasi Goreng   50.000" or "2x Es Teh 10.000"
  //   3. Two lines:    "Nasi Goreng"
  //                    "        25.000"
  parseItems(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Lines that ARE definitely not items
    const skipPatterns = [
      /\b(sub\s*total|subtotal)\b/i,
      /\b(grand\s*total|total\s*akhir|total\s*bayar|total\s*tagihan|^total$|^total\b)/i,
      /\b(tunai|cash|kembali|change|bayar|payment|bca|mandiri|qris|gopay|ovo|dana|debit|credit\s*card|kartu)\b/i,
      /\b(ppn|pb1|pajak|tax|service\s*charge|service\s*chrg|svc\s*chg|biaya\s*layanan)\b/i,
      /\b(discount|diskon|potongan|hemat|voucher|promo)\b/i,
      /\b(kasir|cashier|operator|struk|invoice|bill|no\.?\s*meja|table|guest|pax|cover)\b/i,
      /\b(tanggal|date|jam|time|tgl\b|am\b|pm\b)\b/i,
      /\b(npwp|telp?|telepon|phone|alamat|address|cabang|outlet)\b/i,
      /\b(terima\s*kasih|thank\s*you|selamat|welcome)\b/i,
    ];

    const isSkipLine = (line) => skipPatterns.some(re => re.test(line));

    // Number that looks like a Rupiah price.
    // Matches: 25.000, 25,000, 25 000, 25000, 1.234.567, also leading "Rp"/"IDR"
    const PRICE_RE = /(?:Rp\.?\s*|IDR\s*)?(-?\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|-?\d{4,})/g;

    const extractPrices = (line) => {
      const matches = [...line.matchAll(PRICE_RE)];
      return matches.map(m => ({
        index: m.index,
        end: m.index + m[0].length,
        raw: m[0],
        value: Utils.parseNumber(m[1] || m[0]),
      }));
    };

    const items = [];
    let pendingName = null; // for two-line items

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (isSkipLine(line)) {
        pendingName = null; // reset; nearby pending name is probably part of header
        continue;
      }

      const prices = extractPrices(line);

      // Line with ONLY a price (price column carried over) → combine with previous pending name
      if (prices.length === 1 && pendingName) {
        const priceObj = prices[0];
        // line text excluding the price — must be mostly whitespace
        const remainder = (line.slice(0, priceObj.index) + line.slice(priceObj.end)).replace(/[^a-zA-Z]/g, '').trim();
        if (remainder.length < 3 && priceObj.value >= 500) {
          const parsed = this._extractQtyFromName(pendingName);
          items.push({
            name: parsed.name.slice(0, 80),
            price: parsed.qty > 1 ? Math.round(priceObj.value / parsed.qty) : priceObj.value,
            qty: parsed.qty,
          });
          pendingName = null;
          continue;
        }
      }

      if (prices.length === 0) {
        // Maybe this is the name of a two-line item.
        // Only accept if it has at least one letter and isn't ALL UPPERCASE (often headers).
        const letters = line.replace(/[^a-zA-Z]/g, '');
        if (letters.length >= 3 && line.length <= 60) {
          pendingName = line;
        } else {
          pendingName = null;
        }
        continue;
      }

      // Has price(s) on same line — take last as the line price.
      const priceObj = prices[prices.length - 1];
      const price = priceObj.value;
      if (price < 500) { pendingName = null; continue; } // too small to be an item

      let name = line.slice(0, priceObj.index).trim();
      // If there are multiple prices on the line, drop everything from the first price onwards
      // EXCEPT we already took the last; check if there are middle prices that represent unit price.
      // Common format: "2  Nasi Goreng   25.000   50.000" (qty, name, unit, total)
      // We treat last as total — so name = everything before first price.
      if (prices.length >= 2) {
        name = line.slice(0, prices[0].index).trim();
      }
      // Clean trailing dashes/dots
      name = name.replace(/[\s._\-\/|]+$/, '').trim();
      // Strip leading bullet/marker
      name = name.replace(/^[\d]+[.)\-]\s*/, '').replace(/^[*\-•]\s*/, '').trim();

      const parsed = this._extractQtyFromName(name);
      name = parsed.name;
      const qty = parsed.qty;

      // For multi-price lines, if we see what looks like (qty, unit, total): trust the total / qty
      let unitPrice;
      if (prices.length >= 2) {
        // total / qty might disagree slightly with the second-to-last (the listed unit) — prefer the listed unit if close
        const listedUnit = prices[prices.length - 2].value;
        const computedUnit = qty > 1 ? Math.round(price / qty) : price;
        // If close (within 5%), use listed unit. Else use computed.
        unitPrice = (listedUnit > 0 && Math.abs(listedUnit - computedUnit) / Math.max(listedUnit, computedUnit) < 0.05)
          ? listedUnit
          : computedUnit;
      } else {
        unitPrice = qty > 1 ? Math.round(price / qty) : price;
      }

      if (!name || name.length < 2) { pendingName = null; continue; }

      items.push({
        name: name.slice(0, 80),
        price: unitPrice,
        qty,
      });
      pendingName = null;
    }

    return items;
  },

  // Extract a leading or trailing qty marker from a name string.
  // Returns { name, qty }.
  _extractQtyFromName(rawName) {
    let name = rawName.trim();
    let qty = 1;

    // "2x Nasi Goreng" or "2 x Nasi" or "2 * Nasi"
    let m = name.match(/^(\d{1,3})\s*[xX*]\s+(.+)$/);
    if (m) return { qty: Math.max(1, parseInt(m[1], 10)) || 1, name: m[2].trim() };

    // Leading bare number then space + letter (e.g. "2 Nasi Goreng")
    m = name.match(/^(\d{1,3})\s+([a-zA-Z].+)$/);
    if (m) {
      const q = parseInt(m[1], 10);
      if (q >= 1 && q <= 99) return { qty: q, name: m[2].trim() };
    }

    // Trailing "2x" or "x2"
    m = name.match(/^(.+?)\s+(\d{1,3})\s*[xX]\s*$/);
    if (m) return { qty: Math.max(1, parseInt(m[2], 10)) || 1, name: m[1].trim() };
    m = name.match(/^(.+?)\s+[xX]\s*(\d{1,3})\s*$/);
    if (m) return { qty: Math.max(1, parseInt(m[2], 10)) || 1, name: m[1].trim() };

    return { name, qty };
  },

  // ---- Meta detection: tax %, service %, by % or by amount cross-referenced with subtotal ----
  parseMeta(text) {
    const meta = {};
    const lines = text.split(/\r?\n/);

    // Helpers
    const findAmount = (regex) => {
      for (const line of lines) {
        const m = line.match(regex);
        if (m) return Utils.parseNumber(m[1]);
      }
      return null;
    };
    const findPercent = (regex) => {
      for (const line of lines) {
        const m = line.match(regex);
        if (m) {
          const v = parseFloat((m[1] || '').replace(',', '.'));
          if (!isNaN(v) && v > 0 && v < 50) return v;
        }
      }
      return null;
    };

    // % first (more reliable when present)
    let taxPct = findPercent(/(?:ppn|pb1|pajak|tax)[^0-9%]{0,12}(\d{1,2}(?:[.,]\d+)?)\s*%/i);
    let svcPct = findPercent(/(?:service\s*charge|svc|biaya\s*layanan)[^0-9%]{0,12}(\d{1,2}(?:[.,]\d+)?)\s*%/i);
    let discPct = findPercent(/(?:discount|diskon|potongan)[^0-9%]{0,12}(\d{1,2}(?:[.,]\d+)?)\s*%/i);

    // Amounts (cross-reference with subtotal to derive %)
    const numAtEnd = (label) => new RegExp(`${label}[^0-9-]{0,20}(-?\\d{1,3}(?:[.,\\s]\\d{3})+(?:[.,]\\d{1,2})?|-?\\d{3,})\\s*$`, 'i');
    const subtotalAmt = findAmount(numAtEnd('(?:sub\\s*total|subtotal)'));
    const taxAmt = findAmount(numAtEnd('(?:ppn|pb1|pajak|tax)'));
    const svcAmt = findAmount(numAtEnd('(?:service\\s*charge|svc\\s*chg|biaya\\s*layanan)'));
    const discAmt = findAmount(numAtEnd('(?:discount|diskon|potongan)'));

    if (subtotalAmt && subtotalAmt > 0) {
      if (taxPct == null && taxAmt) {
        const pct = (taxAmt / subtotalAmt) * 100;
        if (pct > 0 && pct < 25) taxPct = Math.round(pct * 10) / 10; // 1 decimal
      }
      if (svcPct == null && svcAmt) {
        const pct = (svcAmt / subtotalAmt) * 100;
        if (pct > 0 && pct < 25) svcPct = Math.round(pct * 10) / 10;
      }
      if (discPct == null && discAmt) {
        const pct = (discAmt / subtotalAmt) * 100;
        if (pct > 0 && pct < 90) discPct = Math.round(pct * 10) / 10;
      }
    }

    if (taxPct != null) meta.taxPercent = taxPct;
    if (svcPct != null) meta.servicePercent = svcPct;
    if (discPct != null) meta.discountPercent = discPct;

    // Raw amounts also returned for UI/debug
    if (subtotalAmt) meta.subtotalAmount = subtotalAmt;
    if (taxAmt) meta.taxAmount = taxAmt;
    if (svcAmt) meta.serviceAmount = svcAmt;
    if (discAmt) meta.discountAmount = discAmt;

    return meta;
  },
};
