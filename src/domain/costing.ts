/**
 * Giá vốn bình quân gia quyền, tính bằng cách PHÁT LẠI toàn bộ lịch sử kho của
 * 1 sản phẩm theo thứ tự thời gian (bình quân gia quyền tức thời, có hồi tố).
 *
 * Mỗi sản phẩm là một "bể" (tồn, giá trị). Duyệt từng sự kiện:
 *   - Nhập hàng   : vào bể theo giá nhập thực (đã phân bổ chiết khấu phiếu)
 *   - Bán hàng    : ra khỏi bể theo giá vốn bình quân ĐÚNG TẠI THỜI ĐIỂM ĐÓ,
 *                   và giá vốn này được ghi lại lên dòng phiếu bán
 *   - Trả hàng    : vào/ra theo bình quân tại thời điểm đó
 *   - Kiểm kho, tồn đầu kỳ: vào/ra theo bình quân tại thời điểm đó
 *   - Phiếu đã huỷ: bỏ qua hoàn toàn (cả phiếu lẫn bút toán đảo của nó)
 *
 * Vì phát lại từ đầu, sửa/huỷ/chèn một phiếu nhập cũ sẽ tự động tính lại giá
 * vốn và lãi của MỌI đơn bán sau phiếu đó (hồi tố). Nhập lô mới sau này không
 * làm đổi lãi đơn trước - mỗi đơn vẫn chịu giá vốn tại lúc nó phát sinh.
 *
 * Đẳng thức luôn đúng: giá vốn hàng đã bán + giá trị tồn = tiền hàng đã chi.
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
  /** Giá vốn mới cho từng dòng phiếu (itemId → giá vốn 1 đơn vị bán) */
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
      const avg = avgNow();
      const qtyBase = e.qty * e.factor;
      const costPerSellUnit = avg * e.factor;
      const before = onHand();
      qty += e.direction * qtyBase;
      value += (onHand() - before) * avg;
      itemCosts.set(e.itemId, costPerSellUnit);
      if (e.kind === "sale") {
        cogs += e.qty * costPerSellUnit;
      } else if (e.direction === 1) {
        cogs -= e.qty * costPerSellUnit; // KH trả lại: bớt giá vốn đã bán
      } else {
        spent -= Math.min(qtyBase, before) * avg; // trả NCC: thu hồi tiền hàng
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
