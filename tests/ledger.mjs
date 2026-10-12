import { replayCostHistory } from "../node_modules/.cache/costing.mjs";

/**
 * Dựng danh sách sự kiện đúng như recomputeProductCost lấy từ DB, rồi phát lại.
 * Mỗi thao tác = thêm sự kiện; huỷ phiếu = bỏ sự kiện; sửa phiếu = huỷ + tạo mới.
 * Thời gian tăng dần theo thứ tự gọi, trừ khi truyền `at` để mô phỏng lùi ngày.
 */
export class Ledger {
  constructor(fallbackCost = 0) {
    this.events = [];
    this.seq = 0;
    this.fallbackCost = fallbackCost;
  }
  _at(at) { return at ?? String(++this.seq).padStart(6, "0"); }
  _id() { return ++this.seq; }

  purchase(lines, discount = 0, at) {
    const ls = lines.map((l) => ({ factor: 1, ...l }));
    const subtotal = ls.reduce((s, l) => s + l.qty * l.price, 0);
    const total = subtotal - discount;
    const t = this._at(at);
    const ids = ls.map((l) => {
      const itemId = this._id();
      this.events.push({ kind: "purchase", at: t, itemId, qty: l.qty, price: l.price,
        factor: l.factor, orderSubtotal: subtotal, orderTotal: total });
      return itemId;
    });
    return { ids, total };
  }
  /** createSale: CHỐT giá vốn hiện hành lúc tạo (snapshot), không ghi đè về sau */
  sale(lines, at) {
    const t = this._at(at);
    const avg = this.cost; // costMap đọc products.price_cost ngay trước khi ghi
    return lines.map((l) => {
      const itemId = this._id();
      const factor = l.factor ?? 1;
      this.events.push({ kind: "sale", at: t, itemId, qty: l.qty, factor, direction: -1,
        cost: avg * factor });
      return itemId;
    });
  }
  returnOrder(lines, side = "customer", at) {
    const t = this._at(at);
    const avg = this.cost;
    return lines.map((l) => {
      const itemId = this._id();
      const factor = l.factor ?? 1;
      this.events.push({ kind: "return", at: t, itemId, qty: l.qty, factor,
        direction: side === "customer" ? 1 : -1, cost: avg * factor });
      return itemId;
    });
  }
  /** Giá vốn đã chốt trên dòng phiếu bán/trả (không đổi về sau) */
  lockedCost(itemId) { return this.events.find((e) => e.itemId === itemId)?.cost; }
  adjust(qtyChange, at) {
    const id = this._id();
    this.events.push({ kind: "adjust", at: this._at(at), id, qtyChange });
    return id;
  }
  /** cancelOrder: phiếu huỷ bị loại khỏi lịch sử hoàn toàn */
  cancel(ids) {
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    this.events = this.events.filter((e) => e.kind === "adjust" || !set.has(e.itemId));
  }
  /** Sửa phiếu nhập = huỷ + tạo lại, GIỮ NGUYÊN thời điểm phiếu cũ */
  editPurchase(order, lines, discount) {
    const at = this.events.find((e) => e.itemId === order.ids[0])?.at;
    this.cancel(order.ids);
    return this.purchase(lines, discount, at);
  }

  replay() { return replayCostHistory(this.events, this.fallbackCost); }
  get r() { return this.replay(); }
  get qty() { return this.r.stockQty; }
  get cost() { return this.r.avgCost; }
  get value() { return this.r.stockValue; }
  get cogs() { return this.r.cogs; }
  get spent() { return this.r.spent; }
  itemCost(itemId) { return this.r.itemCosts.get(itemId) ?? this.lockedCost(itemId); }
  /** Đẳng thức: giá vốn đã bán + giá trị tồn = tiền hàng đã chi */
  get balance() { return this.cogs + this.value - this.spent; }
}
