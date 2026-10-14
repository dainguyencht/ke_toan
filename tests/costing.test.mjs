import { Ledger } from "./ledger.mjs";
import { replayCostHistory, sortEvents } from "../node_modules/.cache/costing.mjs";

let pass = 0, fail = 0;
const EPS = 0.01;
const vnd = (n) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);
const near = (a, b) => Math.abs(a - b) < EPS;
function check(name, actual, expected) {
  const ok = near(actual, expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  → được ${vnd(actual)}, cần ${vnd(expected)}`}`);
}
function checkBalance(name, L) {
  const ok = near(L.balance, 0);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: cân sổ` +
    (ok ? "" : ` → bán ${vnd(L.cogs)} + tồn ${vnd(L.value)} − chi ${vnd(L.spent)} = ${vnd(L.balance)}`));
}
const T = (n) => console.log(`\n── ${n}`);

T("1. Nhập 1 lô rồi bán một phần");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  check("giá vốn = giá nhập", L.cost, 100000);
  const [s] = L.sale([{ qty: 4, price: 200000 }]);
  check("giá vốn không đổi khi bán", L.cost, 100000);
  check("giá vốn ghi trên dòng bán", L.itemCost(s), 100000);
  check("giá vốn hàng bán", L.cogs, 400000);
  check("tồn còn", L.qty, 6);
  checkBalance("sau bán", L);
}

T("2. Hai phiếu nhập khác giá → bình quân gia quyền");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  L.purchase([{ qty: 10, price: 140000 }]);
  check("bình quân (10×100k + 10×140k)/20", L.cost, 120000);
  checkBalance("sau 2 lần nhập", L);
}

T("3. Kịch bản đầy đủ: nhập → bán → nhập → bán");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  const [s1] = L.sale([{ qty: 4, price: 200000 }]);
  L.purchase([{ qty: 10, price: 140000 }]);
  check("bình quân sau nhập 2: (6×100k+10×140k)/16", L.cost, 125000);
  const [s2] = L.sale([{ qty: 4, price: 200000 }]);
  check("đơn 1 chịu giá vốn 100k", L.itemCost(s1), 100000);
  check("đơn 2 chịu giá vốn 125k", L.itemCost(s2), 125000);
  check("giá vốn hàng bán tổng", L.cogs, 900000);
  check("giá trị tồn", L.value, 1500000);
  check("lãi gộp", 8 * 200000 - L.cogs, 700000);
  checkBalance("cuối kịch bản", L);
}

T("4. ⭐ Sửa chiết khấu phiếu nhập cũ SAU khi đã bán: lãi đơn cũ GIỮ NGUYÊN (KiotViet)");
{
  const L = new Ledger();
  const p1 = L.purchase([{ qty: 10, price: 100000 }]);
  const [s1] = L.sale([{ qty: 4, price: 200000 }]);
  L.purchase([{ qty: 10, price: 140000 }]);
  const [s2] = L.sale([{ qty: 4, price: 200000 }]);

  L.editPurchase(p1, [{ qty: 10, price: 100000 }], 200000); // thêm chiết khấu 200k

  check("tiền hàng đã chi", L.spent, 2200000);
  check("đơn 1 vẫn chốt 100k", L.itemCost(s1), 100000);
  check("đơn 2 vẫn chốt 125k", L.itemCost(s2), 125000);
  check("giá vốn hàng bán không đổi", L.cogs, 900000);
  check("chênh lệch chảy vào tồn: (2,2tr − 900k)/12", L.cost, 1300000 / 12);
  check("giá trị tồn 1,3tr", L.value, 1300000);
  checkBalance("sau sửa chiết khấu", L);
}

T("5. ⭐ Nhập lô mới KHÔNG làm đổi lãi đơn cũ (chỉ hồi tố khi sửa)");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  const [s1] = L.sale([{ qty: 10, price: 150000 }]); // bán hết tháng 1
  L.purchase([{ qty: 10, price: 140000 }]);           // tháng 2 giá cao hơn
  check("đơn tháng 1 vẫn giá vốn 100k", L.itemCost(s1), 100000);
  check("giá vốn hiện hành = lô mới", L.cost, 140000);
  checkBalance("nhập lô mới", L);
}

T("6. Nhập có chiết khấu ngay từ đầu");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }], 100000);
  check("giá vốn = 900k/10", L.cost, 90000);
  checkBalance("nhập có chiết khấu", L);
}

T("7. Huỷ phiếu nhập khi chưa bán gì");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  const p2 = L.purchase([{ qty: 10, price: 140000 }]);
  L.cancel(p2.ids);
  check("tồn về 10", L.qty, 10);
  check("giá vốn về 100k", L.cost, 100000);
  checkBalance("sau huỷ phiếu nhập", L);
}

T("8. Huỷ phiếu bán");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  const s = L.sale([{ qty: 4, price: 200000 }]);
  L.purchase([{ qty: 10, price: 140000 }]);
  L.cancel(s);
  check("tồn về 20", L.qty, 20);
  check("giá vốn hàng bán về 0", L.cogs, 0);
  check("bình quân = 2.400.000/20", L.cost, 120000);
  checkBalance("sau huỷ phiếu bán", L);
}

T("9. Bán sạch rồi nhập lô mới → không lai giá cũ");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  L.sale([{ qty: 10, price: 200000 }]);
  check("tồn = 0", L.qty, 0);
  L.purchase([{ qty: 5, price: 300000 }]);
  check("giá vốn = giá lô mới", L.cost, 300000);
  checkBalance("kho rỗng rồi nhập lại", L);
}

T("10. Bán quá tay (tồn âm) rồi nhập về");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  const [s] = L.sale([{ qty: 12, price: 200000 }]);
  check("tồn âm", L.qty, -2);
  check("đơn bán quá tay vẫn chịu giá vốn 100k", L.itemCost(s), 100000);
  L.purchase([{ qty: 10, price: 300000 }]);
  // 2 cái lấp lỗ âm đã bán rồi (giá vốn 100k lúc đó) → không dồn giá trị của
  // chúng lên 8 cái còn lại. Giá vốn = đúng giá lô mới.
  check("giá vốn = giá lô mới 300k, không bị dồn", L.cost, 300000);
  check("giá trị tồn = 8 × 300k", L.value, 2400000);
  check("tồn 8", L.qty, 8);
}

T("11. Kiểm kho (thừa/thiếu) không làm đổi giá vốn");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  L.adjust(+3);
  check("kiểm thừa: giá vốn giữ nguyên", L.cost, 100000);
  check("tồn 13", L.qty, 13);
  L.adjust(-5);
  check("kiểm thiếu: giá vốn giữ nguyên", L.cost, 100000);
  check("tồn 8", L.qty, 8);
}

T("12. Tồn đầu kỳ dùng giá vốn đặt tay khi tạo SP");
{
  const L = new Ledger(50000);
  L.adjust(+10);
  check("giá vốn = giá đặt tay", L.cost, 50000);
  check("giá trị tồn", L.value, 500000);
  const [s] = L.sale([{ qty: 2, price: 80000 }]);
  check("bán chịu giá vốn 50k", L.itemCost(s), 50000);
}

T("13. Khách trả hàng → vào kho, bớt giá vốn đã bán");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  L.sale([{ qty: 5, price: 200000 }]);
  L.returnOrder([{ qty: 2, price: 200000 }], "customer");
  check("tồn 7", L.qty, 7);
  check("giá vốn giữ nguyên", L.cost, 100000);
  check("giá vốn hàng bán ròng = 3 cái", L.cogs, 300000);
  checkBalance("khách trả hàng", L);
}

T("14. Trả hàng cho NCC → xuất kho, thu hồi tiền hàng");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  L.purchase([{ qty: 10, price: 140000 }]);
  L.returnOrder([{ qty: 5, price: 140000 }], "supplier");
  check("tồn 15", L.qty, 15);
  check("giá vốn giữ nguyên 120k", L.cost, 120000);
  check("giá trị tồn", L.value, 1800000);
  checkBalance("trả NCC", L);
}

T("15. Đơn vị quy đổi: nhập theo thùng, bán theo cái");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 1200000, factor: 12 }]);
  check("tồn 120 cái", L.qty, 120);
  check("giá vốn 1 cái", L.cost, 100000);
  const [s] = L.sale([{ qty: 24, price: 150000 }]);
  check("giá vốn dòng bán (1 cái)", L.itemCost(s), 100000);
  const [s2] = L.sale([{ qty: 1, price: 1500000, factor: 12 }]);
  check("bán 1 thùng: giá vốn dòng = 12 × 100k", L.itemCost(s2), 1200000);
  check("giá vốn hàng bán", L.cogs, 3600000);
  checkBalance("đơn vị quy đổi", L);
}

T("16. Chiết khấu 100% (hàng tặng) + chia 0");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  L.purchase([{ qty: 10, price: 100000 }], 1000000);
  check("giá vốn = 1tr/20", L.cost, 50000);
  checkBalance("hàng tặng", L);
  const M = new Ledger();
  M.purchase([{ qty: 5, price: 0 }]);
  check("giá nhập 0 → giá vốn 0, không NaN", Number.isFinite(M.cost) ? M.cost : -1, 0);
}

T("17. Sửa chiết khấu nhiều lần liên tiếp");
{
  const L = new Ledger();
  let p = L.purchase([{ qty: 10, price: 100000 }]);
  const [s] = L.sale([{ qty: 2, price: 200000 }]);
  p = L.editPurchase(p, [{ qty: 10, price: 100000 }], 100000);
  check("đơn bán vẫn chốt 100k", L.itemCost(s), 100000);
  check("tồn gánh chênh: (900k − 200k)/8", L.cost, 87500); checkBalance("sửa lần 1", L);
  p = L.editPurchase(p, [{ qty: 10, price: 100000 }], 300000);
  check("tồn: (700k − 200k)/8", L.cost, 62500); checkBalance("sửa lần 2", L);
  p = L.editPurchase(p, [{ qty: 10, price: 100000 }], 0);
  check("về 100k", L.cost, 100000); checkBalance("sửa về 0", L);
  check("tồn 8", L.qty, 8);
}

T("18. ⭐ Phiếu nhập LÙI NGÀY chèn vào giữa lịch sử");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }], 0, "2026-01-01 08:00:00");
  const [s] = L.sale([{ qty: 5, price: 200000 }], "2026-01-10 08:00:00");
  check("trước khi chèn: đơn chịu 100k", L.itemCost(s), 100000);
  // quên nhập 1 phiếu ngày 05/01, giờ mới ghi lùi ngày
  L.purchase([{ qty: 10, price: 160000 }], 0, "2026-01-05 08:00:00");
  check("đơn 10/01 vẫn chốt 100k (không hồi tố)", L.itemCost(s), 100000);
  check("tồn 15, giá vốn = (2,6tr − 500k)/15", L.cost, 140000);
  check("tồn 15", L.qty, 15);
  checkBalance("phiếu lùi ngày", L);
}

T("19. Phiếu huỷ bị bỏ qua hoàn toàn");
{
  const L = new Ledger();
  L.purchase([{ qty: 10, price: 100000 }]);
  const bad = L.purchase([{ qty: 100, price: 1 }]);
  L.cancel(bad.ids);
  check("giá vốn không dính phiếu huỷ", L.cost, 100000);
  check("tồn 10", L.qty, 10);
}

T("20. Thứ tự cùng thời điểm: nhập trước, bán sau");
{
  const ev = sortEvents([
    { kind: "sale", at: "t", itemId: 2, qty: 1, factor: 1, direction: -1, cost: 1 },
    { kind: "adjust", at: "t", id: 3, qtyChange: 1 },
    { kind: "purchase", at: "t", itemId: 1, qty: 1, price: 1, factor: 1, orderSubtotal: 1, orderTotal: 1 },
  ]);
  check("nhập đứng đầu", ev[0].kind === "purchase" ? 1 : 0, 1);
  check("bán đứng giữa", ev[1].kind === "sale" ? 1 : 0, 1);
  check("điều chỉnh cuối", ev[2].kind === "adjust" ? 1 : 0, 1);
  const r = replayCostHistory(ev);
  check("bán cùng giây với nhập rút đúng giá đã chốt", r.cogs, 1);
  check("tồn còn 1, giá vốn 1", r.avgCost, 1);
}

T("21. Nhiều dòng hàng 1 phiếu, chiết khấu phân bổ theo tỉ lệ thành tiền");
{
  const L = new Ledger();
  const p = L.purchase([{ qty: 10, price: 100000 }, { qty: 5, price: 200000 }], 200000);
  check("dòng A giá vốn 90k", L.itemCost(p.ids[0]), 90000);
  check("dòng B giá vốn 180k", L.itemCost(p.ids[1]), 180000);
  check("tổng tiền chi = 1,8tr", L.spent, 1800000);
}

T("22. ⭐ Bán TRƯỚC khi ghi phiếu nhập: giá đặt tay không được nhiễm vào bể (ca METHYST)");
{
  const L = new Ledger(999999); // giá vốn đặt tay bậy
  L.sale([{ qty: 1, price: 1 }]);
  L.sale([{ qty: 1, price: 0 }]);
  L.purchase([{ qty: 10, price: 0 }]);
  for (let i = 0; i < 8; i++) L.sale([{ qty: 1, price: 100000 }]);
  L.purchase([{ qty: 10, price: 100000 }], 100000); // thực 90k
  L.sale([{ qty: 5, price: 150000 }]);
  L.purchase([{ qty: 5, price: 90000 }], 50000);    // thực 80k
  L.sale([{ qty: 5, price: 150000 }]);
  check("tồn 5", L.qty, 5);
  check("giá vốn = (5×90k + 5×80k)/10 = 85k, không dính 999999", L.cost, 85000);
  check("giá trị tồn = 5 × 85k", L.value, 425000);
}

T("23. Bán vượt rồi SỬA LẠI bằng cách lùi ngày phiếu nhập → chính xác tuyệt đối");
{
  const L = new Ledger();
  const [s] = L.sale([{ qty: 12, price: 200000 }], "2026-03-02 10:00:00");
  L.purchase([{ qty: 10, price: 100000 }], 0, "2026-03-01 09:00:00"); // ghi muộn, lùi ngày
  L.purchase([{ qty: 10, price: 300000 }], 0, "2026-03-03 09:00:00");
  // bán lúc kho rỗng → chốt giá lúc đó (0); phiếu nhập lùi ngày KHÔNG đổi giá đã chốt
  check("đơn bán chốt 0 (lúc đó chưa có gì)", L.itemCost(s), 0);
  check("giá vốn hiện hành = giá lô 2: 300k", L.cost, 300000);
  const M = new Ledger();
  M.purchase([{ qty: 12, price: 100000 }], 0, "2026-03-01 09:00:00");
  const [s2] = M.sale([{ qty: 12, price: 200000 }], "2026-03-02 10:00:00");
  M.purchase([{ qty: 10, price: 300000 }], 0, "2026-03-03 09:00:00");
  check("ghi đủ hàng trước khi bán: giá vốn = 300k sạch", M.cost, 300000);
  check("đơn bán = 100k", M.itemCost(s2), 100000);
  checkBalance("ghi đúng thứ tự thì cân sổ", M);
}

T("24. ⭐ Đơn vị 1,44 m²/hộp: số dư float không được làm giá vốn nổ (ca SKU 2102)");
{
  const L = new Ledger();
  // nhập 42 hộp rồi bán hết 42 hộp, lặp vài vòng → qty về ~0 với sai số 1e-14
  for (let k = 0; k < 5; k++) {
    L.purchase([{ qty: 42, price: 230000, factor: 1.44 }]);
    L.sale([{ qty: 42, price: 331200, factor: 1.44 }]);
  }
  check("tồn ≈ 0", Math.abs(L.qty) < 1e-6 ? 0 : L.qty, 0);
  check("giá vốn hiện hành không nổ (giữ giá lô cuối / m²)", L.cost, 230000 / 1.44);
  const [s] = L.sale([{ qty: 1, price: 331200, factor: 1.44 }]);
  check("đơn bán sau đó: giá vốn 1 hộp = giá lô cuối", L.itemCost(s), 230000);
  check("không có số khổng lồ", L.cost < 1e9 ? 1 : 0, 1);
}

T("25. ⭐ Bán số lượng lớn trước, nhập bù sau (ca 60606 tàu): không dồn giá lên số ít còn lại");
{
  const L = new Ledger();
  L.sale([{ qty: 500, price: 300000, factor: 1.44 }]);          // bán khi chưa ghi nhập
  L.purchase([{ qty: 520, price: 210000 * 1.44, factor: 1.44 }]); // nhập bù 520 hộp @210k/m²
  check("tồn 20 hộp = 28,8 m²", L.qty, 28.8);
  check("giá vốn/m² = đúng giá lô, không phải ×26", L.cost, 210000);
  const [s] = L.sale([{ qty: 10, price: 300000, factor: 1.44 }]);
  check("bán tiếp: chốt giá vốn 1 hộp = 210k × 1,44", L.itemCost(s), 302400);
}

T("26. ⭐ Bán nhiều tháng TRƯỚC phiếu nhập đầu tiên (ca AF5505A1): dùng giá lô nhập đầu, bỏ giá rác");
{
  const L = new Ledger(801116 * 1.5); // price_cost rác từ replay cũ / đặt tay
  const [s1] = L.sale([{ qty: 192, price: 120000, factor: 1.5 }]);
  const [s2] = L.sale([{ qty: 224, price: 123000, factor: 1.5 }]);
  L.purchase([{ qty: 1438.5, price: 68500, factor: 1 }]); // nhập bù sau, theo m²
  check("đơn trước phiếu nhập chốt giá lúc đó (giá đặt tay × 1,5 hộp), không hồi tố", L.itemCost(s1), 801116 * 1.5 * 1.5);
  check("đơn 2 cũng vậy", L.itemCost(s2), 801116 * 1.5 * 1.5);
  check("tồn = 1438,5 − 624 m²", L.qty, 1438.5 - 416 * 1.5);
  check("giá vốn hiện hành = giá lô", L.cost, 68500);
  // giá chốt sai là việc của dữ liệu (bán trước khi ghi nhập) - sửa phiếu bán để chốt lại
}

T("27. ⭐ price_cost đã nổ (10^21) không được tự nuôi khi SP có phiếu nhập (ca 2102)");
{
  const L = new Ledger(1.3e21);
  const [s] = L.sale([{ qty: 28, price: 331200, factor: 1.44 }]);
  L.returnOrder([{ qty: 4, price: 331200, factor: 1.44 }], "customer");
  L.purchase([{ qty: 95.04, price: 195000, factor: 1 }]);
  check("đơn bán chốt giá lúc tạo (giá tay rác) - bể KHÔNG bị nhiễm", L.itemCost(s), 1.3e21 * 1.44);
  check("giá vốn hiện hành lành lại = 195.000", L.cost, 195000);
  check("không còn số khổng lồ", L.cost < 1e9 ? 1 : 0, 1);
}

T("28. SP chưa từng nhập vẫn dùng giá đặt tay (không có lô để nhìn tới)");
{
  const L = new Ledger(50000);
  const [s] = L.sale([{ qty: 3, price: 80000 }]);
  check("giá vốn = giá đặt tay", L.itemCost(s), 50000);
  check("hiện hành = giá đặt tay", L.cost, 50000);
}

console.log(`\n${"=".repeat(50)}\nTỔNG: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
