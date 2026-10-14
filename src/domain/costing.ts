/**
 * Giá vốn bình quân gia quyền tức thời, mô hình KiotViet: CHỐT giá vốn lúc bán,
 * KHÔNG hồi tố. Tính bằng cách PHÁT LẠI lịch sử kho của 1 sản phẩm:
 *
 *   - Nhập hàng : vào bể theo giá nhập thực (đã phân bổ chiết khấu phiếu)
 *   - Bán hàng  : giá vốn đã CHỐT trên dòng phiếu lúc tạo (order_items.cost,
 *                 = bình quân hiện hành lúc đó) - không bao giờ ghi đè. Bể rút
 *                 ra theo đúng giá đã chốt
 *   - Trả hàng  : vào/ra theo giá đã chốt trên dòng phiếu trả
 *   - Kiểm kho, tồn đầu kỳ: vào/ra theo bình quân hiện hành
 *   - Phiếu huỷ : bỏ qua
 *
 * Sửa/huỷ/lùi ngày phiếu nhập → chỉ giá vốn hiện hành (và các đơn bán SAU đó)
 * đổi; lãi đơn đã bán giữ nguyên, chênh lệch chảy vào giá trị tồn kho.
 *
 * Bể chỉ theo dõi hàng THỰC CÓ: xuất khi tồn <= 0 không rút giá khỏi bể, hàng
 * vào chỉ nạp phần thực lên kệ; tồn |qty| < 1e-6 coi như 0 (số dư float của
 * đơn vị 1,44 m²/hộp). Bể rỗng chưa có lịch sử: SP có phiếu nhập lấy giá lô
 * nhập đầu tiên, chưa từng nhập lấy giá đặt tay.
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
      /** Giá vốn ĐÃ CHỐT trên dòng phiếu, cho 1 đơn vị bán (order_items.cost) */
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
  /** Giá nhập thực của từng dòng phiếu NHẬP (itemId → giá 1 đơn vị). Phiếu bán/trả không có ở đây - đã chốt, không ghi đè. */
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
  const sorted = sortEvents(events);

  // Mốc giá vốn khi bể rỗng mà chưa có lịch sử:
  //  - SP có phiếu nhập: lấy giá lô nhập ĐẦU TIÊN (nhìn tới). Rất hay gặp cảnh
  //    bán nhiều tháng rồi mới ghi phiếu nhập bù - hàng bán ra chính là lô đó.
  //  - SP chưa từng nhập: dùng fallbackCost (giá đặt tay trong form SP).
  // KHÔNG được dùng price_cost do replay lần trước ghi ra làm fallback cho SP
  // có phiếu nhập: nó tự nuôi chính nó, một lần nổ là kẹt vĩnh viễn.
  const firstPurchase = sorted.find((e) => e.kind === "purchase");
  const seedCost = firstPurchase
    ? discountedUnitCost(firstPurchase.price, firstPurchase.orderSubtotal, firstPurchase.orderTotal) /
      (firstPurchase.factor > 0 ? firstPurchase.factor : 1)
    : safe(fallbackCost);

  let qty = 0;
  let value = 0;
  let lastAvg = safe(seedCost);
  let cogs = 0;
  let spent = 0;
  const itemCosts = new Map<number, number>();


  // Bể chỉ theo dõi hàng THỰC CÓ. Bán/xuất khi tồn <= 0 (bán quá tay, ghi phiếu
  // nhập muộn) thì phần vượt không có giá vốn thật - KHÔNG được rút giá giả
  // (lastAvg/giá đặt tay) khỏi bể, nếu không bể âm vĩnh viễn và kẹp mọi giá vốn
  // sau về 0. Phần vượt vẫn ghi giá vốn = bình quân hiện hành lên dòng phiếu
  // để báo cáo có số, còn bể để lô nhập sau tự gánh. Cách sửa đúng của người
  // dùng là lùi ngày phiếu nhập - replay sẽ ra kết quả chính xác.
  // Số lượng theo đơn vị quy đổi (vd hộp 1,44 m²) để lại số dư float cỡ 1e-14;
  // coi như 0, nếu không value / qty nổ thành số khổng lồ.
  const EPS = 1e-6;
  const onHand = () => (qty > EPS ? qty : 0);
  const avgNow = () => (qty > EPS ? Math.max(0, value / qty) : lastAvg);

  for (const e of sorted) {
    if (e.kind === "purchase") {
      const unitReal = discountedUnitCost(e.price, e.orderSubtotal, e.orderTotal);
      const unitRealBase = e.factor > 0 ? unitReal / e.factor : unitReal;
      const lineValue = e.qty * unitReal;
      const before = onHand();
      qty += e.qty * e.factor;
      // Chỉ nạp giá trị cho phần thực sự lên kệ. Nếu tồn đang âm (bán trước,
      // ghi nhập sau), phần lấp lỗ âm đã bán rồi - không được dồn giá trị của
      // nó lên số ít còn lại (bán 500 nhập 520 thì 20 cái không gánh giá 520).
      value += (onHand() - before) * unitRealBase;
      spent += lineValue;
      itemCosts.set(e.itemId, unitReal);
    } else if (e.kind === "adjust") {
      const avg = avgNow();
      const before = onHand();
      qty += e.qtyChange;
      // chỉ tính phần thực sự vào/ra khỏi kho dương
      value += (onHand() - before) * avg;
    } else {
      // Giá đã chốt trên phiếu (1 đơn vị bán) → 1 đơn vị gốc
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
    if (qty > EPS) lastAvg = Math.max(0, value / qty);
    else value = 0; // hết hàng (hoặc âm): bể rỗng, không giữ giá trị ma
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
