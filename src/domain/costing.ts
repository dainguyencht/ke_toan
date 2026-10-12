/**
 * Giá vốn bình quân gia quyền tức thời, mô hình giống KiotViet:
 *
 *   - Nhập hàng : vào bể theo giá nhập thực (đã phân bổ chiết khấu phiếu)
 *                 → giá vốn bình quân hiện hành đổi
 *   - Bán hàng  : CHỐT giá vốn hiện hành lên dòng phiếu lúc tạo (snapshot),
 *                 không bao giờ ghi đè. Bể rút ra theo đúng giá đã chốt.
 *   - Trả hàng  : vào/ra bể theo giá đã chốt trên dòng phiếu trả
 *   - Kiểm kho, tồn đầu kỳ: vào/ra theo bình quân hiện hành
 *   - Phiếu huỷ : bỏ qua hoàn toàn
 *
 * Giá vốn hiện hành (products.price_cost / stock_value) được tính bằng cách
 * PHÁT LẠI toàn bộ lịch sử theo thứ tự thời gian, dùng giá đã chốt của từng
 * phiếu bán - nên tự lành, xử lý được huỷ phiếu và phiếu lùi ngày, nhưng KHÔNG
 * hồi tố lãi đơn đã bán. Sửa phiếu nhập cũ (= huỷ + tạo lại) làm chênh lệch
 * chảy vào giá trị tồn kho hiện tại và lãi các đơn bán sau.
 *
 * Bể chỉ theo dõi hàng THỰC CÓ: xuất khi tồn <= 0 không rút giá khỏi bể
 * (tránh bể âm vĩnh viễn khi bán trước lúc ghi phiếu nhập).
 *
 * Hàm thuần, không đụng DB, test bằng `npm test`.
 */

export type CostEvent =
  | {
      kind: "purchase";
      at: string;
      itemId: number;
      /** Số lượng theo đơn vị bán */
      qty: number;
      /** Giá nhập 1 đơn vị bán (chưa trừ chiết khấu phiếu) */
      price: number;
      factor: number;
      /** Tổng/thành tiền cả phiếu, để phân bổ chiết khấu */
      orderSubtotal: number;
      orderTotal: number;
    }
  | {
      /** Bán hàng hoặc trả hàng. direction: -1 = hàng ra khỏi kho */
      kind: "sale" | "return";
      at: string;
      itemId: number;
      qty: number;
      factor: number;
      direction: 1 | -1;
      /** Giá vốn ĐÃ CHỐT trên dòng phiếu, tính cho 1 đơn vị bán (order_items.cost) */
      cost: number;
    }
  | {
      /** Kiểm kho / tồn đầu kỳ / điều chỉnh tay - không có thông tin giá */
      kind: "adjust";
      at: string;
      id: number;
      /** Theo đơn vị gốc, dương = vào kho */
      qtyChange: number;
    };

export type ReplayResult = {
  stockQty: number;
  stockValue: number;
  /** Giá vốn bình quân hiện hành (đơn vị gốc) */
  avgCost: number;
  /** Giá nhập thực của từng dòng phiếu NHẬP (itemId → giá 1 đơn vị). Phiếu bán không có ở đây - đã chốt, không ghi đè. */
  itemCosts: Map<number, number>;
  /** Tổng giá vốn hàng đã bán (để đối chiếu), đơn vị tiền */
  cogs: number;
  /** Tổng tiền hàng đã chi cho các phiếu nhập còn hiệu lực */
  spent: number;
};

/**
 * Giá nhập thực của 1 dòng phiếu nhập sau khi phân bổ chiết khấu cả phiếu theo
 * tỉ lệ thành tiền. Nhập 10 cái x 100k, chiết khấu 100k → 90k/cái.
 */
export function discountedUnitCost(
  unitPrice: number,
  subtotal: number,
  total: number,
): number {
  const ratio = subtotal > 0 ? total / subtotal : 1;
  return unitPrice * ratio;
}

function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Sắp xếp theo thời gian; cùng thời điểm thì nhập trước, bán sau, điều chỉnh cuối. */
const KIND_ORDER: Record<CostEvent["kind"], number> = {
  purchase: 0,
  return: 1,
  sale: 2,
  adjust: 3,
};

export function sortEvents(events: CostEvent[]): CostEvent[] {
  return [...events].sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    const ka = KIND_ORDER[a.kind];
    const kb = KIND_ORDER[b.kind];
    if (ka !== kb) return ka - kb;
    const ia = a.kind === "adjust" ? a.id : a.itemId;
    const ib = b.kind === "adjust" ? b.id : b.itemId;
    return ia - ib;
  });
}

/**
 * Phát lại lịch sử. `fallbackCost` dùng khi bể rỗng/âm (không chia được) -
 * thường là giá vốn người dùng đặt tay lúc tạo sản phẩm.
 */
export function replayCostHistory(
  events: CostEvent[],
  fallbackCost = 0,
): ReplayResult {
  let qty = 0;
  let value = 0;
  let lastAvg = safe(fallbackCost);
  let cogs = 0;
  let spent = 0;
  const itemCosts = new Map<number, number>();

  const avgNow = () => (qty > 0 ? Math.max(0, value / qty) : lastAvg);

  // Bể chỉ theo dõi hàng THỰC CÓ. Bán/xuất khi tồn <= 0 (bán quá tay, ghi phiếu
  // nhập muộn) thì phần vượt không có giá vốn thật - KHÔNG được rút giá giả
  // (lastAvg/giá đặt tay) khỏi bể, nếu không bể âm vĩnh viễn và kẹp mọi giá vốn
  // sau về 0. Phần vượt vẫn ghi giá vốn = bình quân hiện hành lên dòng phiếu
  // để báo cáo có số, còn bể để lô nhập sau tự gánh. Cách sửa đúng của người
  // dùng là lùi ngày phiếu nhập - replay sẽ ra kết quả chính xác.
  const onHand = () => Math.max(0, qty);

  for (const e of sortEvents(events)) {
    if (e.kind === "purchase") {
      const unitReal = discountedUnitCost(e.price, e.orderSubtotal, e.orderTotal);
      const lineValue = e.qty * unitReal;
      qty += e.qty * e.factor;
      value += lineValue;
      spent += lineValue;
      itemCosts.set(e.itemId, unitReal);
    } else if (e.kind === "adjust") {
      const avg = avgNow();
      const before = onHand();
      qty += e.qtyChange;
      // chỉ tính phần thực sự vào/ra khỏi kho dương
      value += (onHand() - before) * avg;
    } else {
      // Giá đã chốt trên phiếu (1 đơn vị bán) → quy về 1 đơn vị gốc
      const unitCost = e.factor > 0 ? e.cost / e.factor : e.cost;
      const qtyBase = e.qty * e.factor;
      const before = onHand();
      qty += e.direction * qtyBase;
      value += (onHand() - before) * unitCost;
      if (e.kind === "sale") {
        cogs += e.qty * e.cost;
      } else if (e.direction === 1) {
        cogs -= e.qty * e.cost; // KH trả lại: bớt giá vốn đã bán
      } else {
        spent -= Math.min(qtyBase, before) * unitCost; // trả NCC: thu hồi tiền hàng
      }
    }
    if (qty > 0) lastAvg = Math.max(0, value / qty);
  }

  return {
    stockQty: qty,
    stockValue: value,
    avgCost: avgNow(),
    itemCosts,
    cogs,
    spent,
  };
}
