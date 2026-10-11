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

T("4. ⭐ HỒI TỐ: sửa chiết khấu phiếu nhập cũ SAU khi đã bán");
{
  const L = new Ledger();
  const p1 = L.purchase([{ qty: 10, price: 100000 }]);
  const [s1] = L.sale([{ qty: 4, price: 200000 }]);
  L.purchase([{ qty: 10, price: 140000 }]);
  const [s2] = L.sale([{ qty: 4, price: 200000 }]);

  L.editPurchase(p1, [{ qty: 10, price: 100000 }], 200000); // thêm chiết khấu 200k

  check("tiền hàng đã chi", L.spent, 2200000);
  check("đơn 1 được tính lại: 80k", L.itemCost(s1), 80000);
  check("đơn 2 được tính lại: (6×80k+10×140k)/16", L.itemCost(s2), 117500);
  check("giá vốn hàng bán mới", L.cogs, 790000);
  check("lãi gộp mới", 8 * 200000 - L.cogs, 810000);
  check("giá vốn tồn", L.cost, 117500);
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
  check("giá vốn = (4tr − 1,2tr)/8 - bể tự bù phần bán vượt", L.cost, 350000);
  checkBalance("tồn âm rồi nhập về", L);
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
  check("đơn bán hồi tố 90k", L.itemCost(s), 90000); checkBalance("sửa lần 1", L);
  p = L.editPurchase(p, [{ qty: 10, price: 100000 }], 300000);
  check("đơn bán hồi tố 70k", L.itemCost(s), 70000); checkBalance("sửa lần 2", L);
  p = L.editPurchase(p, [{ qty: 10, price: 100000 }], 0);
  check("đơn bán về 100k", L.itemCost(s), 100000); checkBalance("sửa về 0", L);
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
  check("đơn 10/01 hồi tố theo bình quân 130k", L.itemCost(s), 130000);
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
    { kind: "sale", at: "t", itemId: 2, qty: 1, factor: 1, direction: -1 },
    { kind: "adjust", at: "t", id: 3, qtyChange: 1 },
    { kind: "purchase", at: "t", itemId: 1, qty: 1, price: 1, factor: 1, orderSubtotal: 1, orderTotal: 1 },
  ]);
  check("nhập đứng đầu", ev[0].kind === "purchase" ? 1 : 0, 1);
  check("bán đứng giữa", ev[1].kind === "sale" ? 1 : 0, 1);
  check("điều chỉnh cuối", ev[2].kind === "adjust" ? 1 : 0, 1);
  const r = replayCostHistory(ev);
  check("bán cùng giây với nhập vẫn có giá vốn", r.itemCosts.get(2), 1);
}

T("21. Nhiều dòng hàng 1 phiếu, chiết khấu phân bổ theo tỉ lệ thành tiền");
{
  const L = new Ledger();
  const p = L.purchase([{ qty: 10, price: 100000 }, { qty: 5, price: 200000 }], 200000);
  check("dòng A giá vốn 90k", L.itemCost(p.ids[0]), 90000);
  check("dòng B giá vốn 180k", L.itemCost(p.ids[1]), 180000);
  check("tổng tiền chi = 1,8tr", L.spent, 1800000);
}

console.log(`\n${"=".repeat(50)}\nTỔNG: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
