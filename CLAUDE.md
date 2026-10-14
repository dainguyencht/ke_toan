# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sổ Sách - desktop app (Tauri 2) quản lý hộ kinh doanh bán lẻ nhỏ: sản phẩm, kho, đơn hàng, khách hàng/NCC, công nợ, sổ quỹ, báo cáo.
Offline-first, dữ liệu lưu SQLite local, không server. UI + domain đều tiếng Việt - giữ nguyên ngôn ngữ khi thêm code/comment/label.

## Commands

```bash
npm run tauri dev      # chạy app dev (Vite + Rust WebView) - dùng cái này để test
npm run build          # tsc typecheck + vite build (frontend only)
npm run tauri build    # build bundle production -> src-tauri/target/release/bundle/
npm run dev            # chỉ Vite (không có Tauri API, plugin-sql sẽ fail)
```

`npm test` chạy bộ test giá vốn bình quân gia quyền (`tests/costing.test.mjs`, 112 assertion, thuần Node - transpile `src/domain/costing.ts` bằng esbuild). `cargo test` trong `src-tauri/` chạy test backup/WAL.
Không có lint script. Typecheck qua `npm run build` (tsc chạy trước vite).

## Architecture

### Data flow: SQL chạy ở frontend, không qua Rust

DB được truy cập trực tiếp từ TypeScript qua `@tauri-apps/plugin-sql`, KHÔNG qua Rust command.
`src/db/client.ts` giữ 1 singleton `Database` (`getDb()`, **single-flight**: cache promise, không chỉ cache kết quả - nếu không hàng chục hook lúc mount gọi `Database.load` song song → nhiều pool, migration chạy trên pool đầu trong khi pool khác đã truy vấn (race "table _sqlx_migrations already exists") và lỗi migration bị che). Rust (`src-tauri/src/lib.rs`) chỉ lo: migrations, auto-backup, backup/restore/save file. Đừng thêm CRUD vào Rust.

Layer từ trên xuống:
- `src/pages/` - màn hình (1 route mỗi trang, xem `App.tsx`)
- `src/hooks/use*.ts` - TanStack Query wrappers (cache + invalidation)
- `src/db/*.ts` - hàm SQL thuần, trả về row typed
- `src/domain/types.ts` - **nguồn type duy nhất**, khớp 1-1 với schema SQL
- `@` alias -> `src/` (vite + tsconfig)

### Migrations

SQL migrations ở `src-tauri/migrations/NNN_*.sql`, chạy tự động lúc app khởi động qua tauri-plugin-sql.
**Thêm migration = 2 bước:** tạo file `.sql` MỚI (đánh số kế tiếp) + đăng ký trong `vec![Migration{...}]` ở [lib.rs](src-tauri/src/lib.rs). Không sửa migration cũ đã chạy trên máy user.
Vài migration là recompute/backfill (006, 007, 008, 010) - chạy lại logic tính toán để sửa data lệch.
**Bẫy checksum:** sqlx lưu sha384 của nội dung `.sql` vào `_sqlx_migrations`. File checkout CRLF (Windows) và LF (Mac) cho checksum khác nhau → DB tạo trên Windows mở bằng build Mac (hoặc ngược lại) bị `VersionMismatch(1)`. tauri-plugin-sql rút migrations khỏi map **trước** khi chạy nên lần `load` đầu lỗi, các lần sau thành công **mà không migrate** - app chạy với DB thiếu bảng, không có lỗi nào hiện ra. Lưới an toàn: `assertDbMigrated()` ([db/costBackfill.ts](src/db/costBackfill.ts)) so `MAX(version)` với `latest_migration_version` (Rust) lúc khởi động, lệch thì toast lỗi. **Không đổi line ending của migrations** - user Windows đang có checksum CRLF. Khi restore DB chéo nền tảng để dev: vá cột `checksum` = sha384(file) của máy mình. `cargo test` có test migrate DB trống tới version mới nhất.

### Invariants về tồn kho & công nợ

- **Tồn kho:** `stock_movements` là source of truth. `product_variants.stock_qty` chỉ là cache, rebuild được bằng SUM(qty_change). Mọi thay đổi kho phải ghi 1 movement.
- **Công nợ:** `customers.debt_amount` / `suppliers.debt_amount` là cache. Sau MỌI mutation (tạo/huỷ đơn, thu/chi, điều chỉnh) phải gọi `recomputeAndSetContactDebt()` ([db/orders.ts](src/db/orders.ts)) - nó tính lại từ timeline visible (orders != cancelled + cash liên kết) nên luôn khớp, chống lệch do edge case.
- **Snapshot:** đơn hàng snapshot giá trị tại thời điểm chốt - `order_items.cost` (tính lãi), `unit_name`/`unit_factor` (đơn vị bán), `orders.snapshot_debt` (nợ cũ trước phiếu). Không tính ngược từ giá hiện tại.
- **Giá vốn (giống KiotViet: chốt lúc bán, không hồi tố):** bình quân gia quyền tức thời. `products.stock_value` + `price_cost` tính bằng cách **phát lại lịch sử kho** ([domain/costing.ts](src/domain/costing.ts) `replayCostHistory`, thuần) qua `recomputeProductCost` ([db/products.ts](src/db/products.ts)) - **gọi sau MỌI biến động kho**. Nhập nạp theo giá đã phân bổ chiết khấu phiếu (`order_items.cost` phiếu nhập = giá nhập thực, được ghi lại). **Phiếu bán/trả CHỐT giá vốn lúc tạo** (`order_items.cost` = `price_cost` hiện hành) và **không bao giờ ghi đè**; bể rút theo giá đã chốt; phiếu huỷ bị bỏ qua. Báo cáo lãi đọc giá đã chốt → sửa phiếu nhập cũ (= huỷ + tạo lại) chỉ đổi giá vốn hiện hành và đơn bán **sau** đó. Bể chỉ theo dõi hàng thực có (hàng ra chỉ rút phần trên kệ, hàng vào chỉ nạp phần thực lên kệ); |qty| < 1e-6 coi như 0 (float của 1,44 m²/hộp). Bể rỗng chưa có lịch sử: SP có phiếu nhập lấy giá **lô nhập đầu tiên**, chưa từng nhập lấy giá đặt tay - **không** dùng `price_cost` do replay ghi ra làm fallback (tự nuôi). Đổi thuật toán → tăng `KEY` ở [db/costBackfill.ts](src/db/costBackfill.ts) (`cost_backfill_vN`); backfill ghim `backups/ke_toan_truoc_gia_von_vN.db` (Rust không xoay vòng) + ghi `cost_backfill_log` (SP) và `cost_backfill_item_log` (dòng phiếu nhập). Cài đặt có nút **Tính lại giá vốn** và **Xuất báo cáo giá vốn** ([lib/costReportExport.ts](src/lib/costReportExport.ts)). Lịch sử: v0.1.45-46 từng hồi tố (QuickBooks), chủ app đổi về KiotViet ở v0.1.47.
- **Điều chỉnh nợ:** chỉnh tay dư nợ tạo 1 phiếu `debt_adjustments` (audit trail), hiện trong timeline.

### Đơn vị bán (multi-unit)

1 product có nhiều `product_units` với `factor` (1 unit = factor × base_unit). Giá null = suy ra từ giá base × factor. Đơn hàng lưu theo unit bán + factor để quy đổi về base khi trừ kho.

### Tiền & ngày

- Tiền VND lưu số nguyên, format qua `formatVND` ([lib/utils.ts](src/lib/utils.ts)); qty là REAL.
- **Ngày dùng giờ LOCAL, không bao giờ `toISOString()`** (nó ra UTC -> lệch ngày sớm/khuya). Lưu qua `dbDateTime()` ('YYYY-MM-DD HH:MM:SS'), filter qua `toISODate()`. Xem helpers trong [lib/utils.ts](src/lib/utils.ts).

### In hoá đơn

Route `/print-invoice` render tách biệt (App.tsx bypass Sidebar). Export Excel/Word/PDF qua exceljs/docx/jspdf ở `src/lib/`. Ghi file qua Rust command `save_bytes` + `open_path_in_os`.

## Convention

- Không dùng em dash `—`, dùng `-`.
- Comment/label tiếng Việt, khớp giọng code hiện có.
- UI primitives ở `src/components/ui/` (shadcn-style: button, dialog, table, tabs...). Dùng lại thay vì tự viết.
- Version bump trong cả `package.json` và `src-tauri/Cargo.toml` (giữ đồng bộ).
