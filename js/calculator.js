// Bill calculation — proportional fair-split logic
// Order (mirrors typical Indonesian receipts):
//   subtotal -> discount -> service charge -> tax (on subtotal+service) -> lainnya (rounding/misc)

const Calculator = {
  compute(state) {
    const people = state.people || [];
    const items = state.items || [];
    const charges = state.charges || {};

    const perPerson = {};
    people.forEach(p => {
      perPerson[p.id] = {
        id: p.id,
        name: p.name,
        subtotal: 0,
        items: [],
        discount: 0,
        service: 0,
        tax: 0,
        other: 0,
        total: 0,
      };
    });

    // ---- Allocate each item's subtotal across its assigned people ----
    let totalSubtotal = 0;
    const itemBreakdowns = [];

    items.forEach(item => {
      const itemSubtotal = (Number(item.price) || 0) * (Math.max(1, Number(item.qty) || 1));
      totalSubtotal += itemSubtotal;

      const assigned = (item.assignedTo && item.assignedTo.length > 0)
        ? item.assignedTo.filter(pid => perPerson[pid])
        : people.map(p => p.id); // fallback: split equally

      if (assigned.length === 0) {
        itemBreakdowns.push({
          id: item.id, name: item.name, qty: item.qty, subtotal: itemSubtotal,
          share: itemSubtotal, assignees: [], unassigned: true,
        });
        return;
      }

      const sharePer = itemSubtotal / assigned.length;
      assigned.forEach(pid => {
        perPerson[pid].subtotal += sharePer;
        perPerson[pid].items.push({
          itemId: item.id, name: item.name, qty: item.qty,
          fullPrice: itemSubtotal, share: sharePer, splitCount: assigned.length,
        });
      });

      itemBreakdowns.push({
        id: item.id, name: item.name, qty: item.qty || 1, subtotal: itemSubtotal,
        share: sharePer, assignees: assigned, unassigned: false,
      });
    });

    // ---- Discount (proportional to subtotal) ----
    const discountPercent = Math.max(0, Number(charges.discountPercent) || 0);
    const discountAmount = Math.max(0, Number(charges.discountAmount) || 0);
    const totalDiscount = (totalSubtotal * discountPercent / 100) + discountAmount;

    people.forEach(p => {
      const pp = perPerson[p.id];
      if (totalSubtotal > 0) {
        pp.discount = totalDiscount * (pp.subtotal / totalSubtotal);
      }
    });

    // ---- Service (% of subtotal-after-discount, per person) ----
    const servicePercent = Math.max(0, Number(charges.servicePercent) || 0);
    people.forEach(p => {
      const pp = perPerson[p.id];
      const afterDisc = pp.subtotal - pp.discount;
      pp.service = afterDisc * servicePercent / 100;
    });

    // ---- Tax PB1 (on subtotal-after-discount + service charge) ----
    const taxPercent = Math.max(0, Number(charges.taxPercent) || 0);
    people.forEach(p => {
      const pp = perPerson[p.id];
      const taxBase = (pp.subtotal - pp.discount) + pp.service;
      pp.tax = taxBase * taxPercent / 100;
    });

    // ---- Computed total (before "Lainnya") ----
    let computedTotal = 0;
    people.forEach(p => {
      const pp = perPerson[p.id];
      pp.total = (pp.subtotal - pp.discount) + pp.service + pp.tax;
      computedTotal += pp.total;
    });

    // ---- Lainnya: auto-diff if actualTotal is provided ----
    // Otherwise lainnya = 0. Distribute proportionally to subtotal.
    const actualTotal = Math.max(0, Number(charges.actualTotal) || 0);
    let lainnya = 0;
    if (actualTotal > 0 && totalSubtotal > 0) {
      lainnya = actualTotal - computedTotal;
      // Distribute proportionally to each person's subtotal
      people.forEach(p => {
        const pp = perPerson[p.id];
        const proportion = pp.subtotal / totalSubtotal;
        pp.other = lainnya * proportion;
        pp.total += pp.other;
      });
    }

    // ---- Grand totals ----
    const grand = {
      subtotal: totalSubtotal,
      discount: totalDiscount,
      service: 0,
      tax: 0,
      other: lainnya,
      computedTotal,
      total: 0,
      actualTotal,
      hasActualTotal: actualTotal > 0,
      // Discrepancy magnitude for UI warning
      discrepancy: actualTotal > 0 ? Math.abs(lainnya) : 0,
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
