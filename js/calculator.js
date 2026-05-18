// Bill calculation — proportional fair-split logic
// Convention (mirrors typical Indonesian receipts):
//   subtotal -> discount -> service charge -> tax (PB1, applied on subtotal+service)

const Calculator = {
  compute(state) {
    const people = state.people || [];
    const items = state.items || [];
    const charges = state.charges || {};

    // Init per-person totals
    const perPerson = {};
    people.forEach(p => {
      perPerson[p.id] = {
        id: p.id,
        name: p.name,
        subtotal: 0,
        items: [],         // [{ name, share, fullPrice, splitWith }]
        discount: 0,
        service: 0,
        tax: 0,
        total: 0,
      };
    });

    // Allocate each item's subtotal across its assigned people
    let totalSubtotal = 0;
    const itemBreakdowns = [];

    items.forEach(item => {
      const itemSubtotal = (Number(item.price) || 0) * (Math.max(1, Number(item.qty) || 1));
      totalSubtotal += itemSubtotal;

      // If no one assigned, fall back to splitting equally among everyone.
      // This makes "shared dishes" (mineral water, dessert, etc.) easy to enter without ticking everyone.
      const assigned = (item.assignedTo && item.assignedTo.length > 0)
        ? item.assignedTo.filter(pid => perPerson[pid])
        : people.map(p => p.id);

      if (assigned.length === 0) {
        // No people in the bill at all — record as unassigned
        itemBreakdowns.push({
          id: item.id, name: item.name, subtotal: itemSubtotal, share: itemSubtotal, assignees: [], unassigned: true,
        });
        return;
      }

      const sharePer = itemSubtotal / assigned.length;
      assigned.forEach(pid => {
        perPerson[pid].subtotal += sharePer;
        perPerson[pid].items.push({
          itemId: item.id,
          name: item.name,
          qty: item.qty,
          fullPrice: itemSubtotal,
          share: sharePer,
          splitCount: assigned.length,
        });
      });

      itemBreakdowns.push({
        id: item.id,
        name: item.name,
        subtotal: itemSubtotal,
        share: sharePer,
        assignees: assigned,
        unassigned: false,
      });
    });

    // ---- Apply discounts (proportional to each person's subtotal) ----
    const discountPercent = Math.max(0, Number(charges.discountPercent) || 0);
    const discountAmount = Math.max(0, Number(charges.discountAmount) || 0);
    const totalDiscount = (totalSubtotal * discountPercent / 100) + discountAmount;

    people.forEach(p => {
      const pp = perPerson[p.id];
      if (totalSubtotal > 0) {
        const proportion = pp.subtotal / totalSubtotal;
        pp.discount = totalDiscount * proportion;
      }
    });

    // ---- Service charge (% of subtotal-after-discount, per person) ----
    const servicePercent = Math.max(0, Number(charges.servicePercent) || 0);
    people.forEach(p => {
      const pp = perPerson[p.id];
      const afterDisc = pp.subtotal - pp.discount;
      pp.service = afterDisc * servicePercent / 100;
    });

    // ---- Tax PB1 (% on subtotal-after-discount + service charge) ----
    const taxPercent = Math.max(0, Number(charges.taxPercent) || 0);
    people.forEach(p => {
      const pp = perPerson[p.id];
      const taxBase = (pp.subtotal - pp.discount) + pp.service;
      pp.tax = taxBase * taxPercent / 100;
      pp.total = (pp.subtotal - pp.discount) + pp.service + pp.tax;
    });

    // ---- Grand totals ----
    const grand = {
      subtotal: totalSubtotal,
      discount: totalDiscount,
      service: 0,
      tax: 0,
      total: 0,
    };
    people.forEach(p => {
      const pp = perPerson[p.id];
      grand.service += pp.service;
      grand.tax += pp.tax;
      grand.total += pp.total;
    });

    return {
      perPerson: people.map(p => perPerson[p.id]),
      grand,
      itemBreakdowns,
      hasUnassigned: itemBreakdowns.some(b => b.unassigned),
    };
  },
};
