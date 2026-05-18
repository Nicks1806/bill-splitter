// OCR receipt scanning via Tesseract.js
// Best-effort parse: extract lines that look like "<name> <price>" and treat as items.

const OCR = {
  async runOnFile(file, onProgress) {
    if (!window.Tesseract) {
      throw new Error('Library OCR belum siap. Coba refresh halaman.');
    }
    const result = await window.Tesseract.recognize(file, 'ind+eng', {
      logger: msg => {
        if (typeof onProgress === 'function' && msg.status && msg.progress !== undefined) {
          onProgress(msg);
        }
      },
    });
    const text = result?.data?.text || '';
    return {
      rawText: text,
      items: this.parseItems(text),
      meta: this.parseMeta(text),
    };
  },

  // Heuristic line parser: looks for "name ... number" patterns.
  // Filters out totals, tax, change, etc.
  parseItems(text) {
    const lines = text.split(/\r?\n/);
    const skipPatterns = [
      /\b(sub\s*total|subtotal|total|grand\s*total|tunai|cash|kembali|change|bayar|payment)\b/i,
      /\b(ppn|pajak|tax|service|svc|biaya|charge)\b/i,
      /\b(discount|diskon|potongan|hemat)\b/i,
      /\b(kasir|cashier|operator|struk|invoice|no[:.])\b/i,
      /\b(tanggal|date|jam|time|tgl)\b/i,
      /\b(npwp|tel(p|p)?|telepon|phone|alamat|address)\b/i,
    ];

    const items = [];

    for (let raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.length < 4) continue;

      // Skip header/footer-looking lines
      if (skipPatterns.some(re => re.test(line))) continue;

      // Find the last number-like token (price typically rightmost on line)
      // Accept "25.000", "25,000", "25000", "25.000,00"
      const numRe = /(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{3,})/g;
      const matches = [...line.matchAll(numRe)];
      if (matches.length === 0) continue;

      const lastMatch = matches[matches.length - 1];
      const priceStr = lastMatch[0];
      const price = Utils.parseNumber(priceStr);
      if (price < 500) continue; // probably not a real item price in IDR

      // Name = everything before the price; strip any leading qty marker like "2x" or "2 x"
      let name = line.slice(0, lastMatch.index).trim();
      let qty = 1;
      const qtyMatch = name.match(/^(\d{1,3})\s*[xX*]\s+(.+)$/);
      if (qtyMatch) {
        qty = parseInt(qtyMatch[1], 10) || 1;
        name = qtyMatch[2].trim();
      } else {
        // Also try "name 2x" pattern at end
        const qtyEnd = name.match(/^(.+?)\s+(\d{1,3})\s*[xX*]\s*$/);
        if (qtyEnd) {
          name = qtyEnd[1].trim();
          qty = parseInt(qtyEnd[2], 10) || 1;
        }
      }

      // Clean trailing dots, dashes, slashes
      name = name.replace(/[._\-\/]+$/, '').trim();
      // Strip leading bullet/number markers like "1." or "*"
      name = name.replace(/^[\d]+[.)\-]\s*/, '').replace(/^[*\-]\s*/, '').trim();

      if (!name || name.length < 2) continue;

      // If quantity in name is implied by price-per-item, calculate unit price
      // We store full line price as `price` and qty as `qty`. To get unit price, divide.
      const unitPrice = qty > 1 ? Math.round(price / qty) : price;

      items.push({
        name: name.slice(0, 80),
        price: unitPrice,
        qty,
      });
    }

    return items;
  },

  // Try to detect tax %, service %, total — useful for autofilling charges.
  parseMeta(text) {
    const meta = {};
    // Tax percentage e.g. "PPN 10%", "Tax 11%"
    const taxRe = /(?:ppn|pajak|tax)[^0-9]{0,10}(\d{1,2}(?:[.,]\d+)?)\s*%/i;
    const taxM = text.match(taxRe);
    if (taxM) meta.taxPercent = parseFloat(taxM[1].replace(',', '.'));

    const svcRe = /(?:service\s*charge|svc|biaya\s*layanan)[^0-9]{0,10}(\d{1,2}(?:[.,]\d+)?)\s*%/i;
    const svcM = text.match(svcRe);
    if (svcM) meta.servicePercent = parseFloat(svcM[1].replace(',', '.'));

    return meta;
  },
};
