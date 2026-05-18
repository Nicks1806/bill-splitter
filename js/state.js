// Central state + persistence

const State = {
  current: {
    id: null,
    title: '',
    date: Utils.todayISO(),
    note: '',
    people: [],     // [{ id, name }]
    items: [],      // [{ id, name, price, qty, assignedTo: [personId, ...] }]
    charges: {
      taxPercent: 0,
      servicePercent: 0,
      discountPercent: 0,
      discountAmount: 0,
      actualTotal: 0,  // optional: actual total from receipt → drives "Lainnya" auto-calc
    },
  },

  HISTORY_KEY: 'billsplitter_history_v1',
  DRAFT_KEY: 'billsplitter_draft_v1',

  newBill() {
    this.current = {
      id: Utils.uid('bill'),
      title: '',
      date: Utils.todayISO(),
      note: '',
      people: [],
      items: [],
      charges: { taxPercent: 0, servicePercent: 0, discountPercent: 0, discountAmount: 0, actualTotal: 0 },
    };
    this.saveDraft();
  },

  // ---- People ----
  addPerson(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    // prevent duplicates (case-insensitive)
    const exists = this.current.people.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return exists;
    const p = { id: Utils.uid('p'), name: trimmed };
    this.current.people.push(p);
    this.saveDraft();
    return p;
  },

  removePerson(personId) {
    this.current.people = this.current.people.filter(p => p.id !== personId);
    // Remove this person from item assignments
    this.current.items.forEach(item => {
      item.assignedTo = item.assignedTo.filter(id => id !== personId);
    });
    this.saveDraft();
  },

  renamePerson(personId, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    const p = this.current.people.find(x => x.id === personId);
    if (p) {
      p.name = trimmed;
      this.saveDraft();
    }
  },

  // ---- Items ----
  addItem(item) {
    const newItem = {
      id: Utils.uid('i'),
      name: item.name || 'Item tanpa nama',
      price: Number(item.price) || 0,
      qty: Math.max(1, Number(item.qty) || 1),
      assignedTo: Array.isArray(item.assignedTo) ? [...item.assignedTo] : [],
    };
    this.current.items.push(newItem);
    this.saveDraft();
    return newItem;
  },

  updateItem(itemId, patch) {
    const item = this.current.items.find(i => i.id === itemId);
    if (!item) return;
    if (patch.name !== undefined) item.name = patch.name;
    if (patch.price !== undefined) item.price = Number(patch.price) || 0;
    if (patch.qty !== undefined) item.qty = Math.max(1, Number(patch.qty) || 1);
    if (patch.assignedTo !== undefined) item.assignedTo = [...patch.assignedTo];
    this.saveDraft();
  },

  removeItem(itemId) {
    this.current.items = this.current.items.filter(i => i.id !== itemId);
    this.saveDraft();
  },

  // ---- Charges ----
  updateCharges(patch) {
    Object.assign(this.current.charges, patch);
    this.saveDraft();
  },

  // ---- Meta ----
  updateMeta(patch) {
    if (patch.title !== undefined) this.current.title = patch.title;
    if (patch.date !== undefined) this.current.date = patch.date;
    if (patch.note !== undefined) this.current.note = patch.note;
    this.saveDraft();
  },

  // ---- Persistence: draft (auto) ----
  saveDraft() {
    try {
      localStorage.setItem(this.DRAFT_KEY, JSON.stringify(this.current));
    } catch (e) {
      console.warn('Gagal save draft:', e);
    }
  },

  loadDraft() {
    try {
      const raw = localStorage.getItem(this.DRAFT_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) {
        this.current = this._migrate(parsed);
        return true;
      }
    } catch (e) {
      console.warn('Gagal load draft:', e);
    }
    return false;
  },

  // ---- Persistence: history (saved bills) ----
  getHistory() {
    try {
      const raw = localStorage.getItem(this.HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  },

  saveToHistory() {
    if (!this.current.id) this.current.id = Utils.uid('bill');
    const history = this.getHistory();
    const idx = history.findIndex(b => b.id === this.current.id);
    const snapshot = JSON.parse(JSON.stringify(this.current));
    snapshot.savedAt = new Date().toISOString();
    if (idx >= 0) {
      history[idx] = snapshot;
    } else {
      history.unshift(snapshot);
    }
    // Cap history to most recent 50 to avoid localStorage bloat
    const trimmed = history.slice(0, 50);
    localStorage.setItem(this.HISTORY_KEY, JSON.stringify(trimmed));
    return snapshot;
  },

  loadFromHistory(billId) {
    const history = this.getHistory();
    const bill = history.find(b => b.id === billId);
    if (bill) {
      this.current = this._migrate(JSON.parse(JSON.stringify(bill)));
      this.saveDraft();
      return true;
    }
    return false;
  },

  deleteFromHistory(billId) {
    const history = this.getHistory().filter(b => b.id !== billId);
    localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
  },

  // Load state directly (e.g. from share link)
  loadFromObject(obj) {
    if (!obj || typeof obj !== 'object') return false;
    this.current = this._migrate(obj);
    this.saveDraft();
    return true;
  },

  // Defensive migration — make sure shape is valid
  _migrate(obj) {
    return {
      id: obj.id || Utils.uid('bill'),
      title: obj.title || '',
      date: obj.date || Utils.todayISO(),
      note: obj.note || '',
      people: Array.isArray(obj.people) ? obj.people.filter(p => p && p.id && p.name) : [],
      items: Array.isArray(obj.items) ? obj.items.map(i => ({
        id: i.id || Utils.uid('i'),
        name: i.name || '',
        price: Number(i.price) || 0,
        qty: Math.max(1, Number(i.qty) || 1),
        assignedTo: Array.isArray(i.assignedTo) ? i.assignedTo : [],
      })) : [],
      charges: {
        taxPercent: Number(obj.charges?.taxPercent) || 0,
        servicePercent: Number(obj.charges?.servicePercent) || 0,
        discountPercent: Number(obj.charges?.discountPercent) || 0,
        discountAmount: Number(obj.charges?.discountAmount) || 0,
        actualTotal: Number(obj.charges?.actualTotal) || 0,
      },
    };
  },
};
