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

Không có test runner, không có lint script. Typecheck qua `npm run build` (tsc chạy trước vite).
Chạy 1 test đơn lẻ: không áp dụng.

## Architecture

### Data flow: SQL chạy ở frontend, không qua Rust

DB được truy cập trực tiếp từ TypeScript qua `@tauri-apps/plugin-sql`, KHÔNG qua Rust command.
`src/db/client.ts` giữ 1 singleton `Database` (`getDb()`). Rust (`src-tauri/src/lib.rs`) chỉ lo: migrations, auto-backup, backup/restore/save file. Đừng thêm CRUD vào Rust.

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

### Invariants về tồn kho & công nợ

- **Tồn kho:** `stock_movements` là source of truth. `product_variants.stock_qty` chỉ là cache, rebuild được bằng SUM(qty_change). Mọi thay đổi kho phải ghi 1 movement.
- **Công nợ:** `customers.debt_amount` / `suppliers.debt_amount` là cache. Sau MỌI mutation (tạo/huỷ đơn, thu/chi, điều chỉnh) phải gọi `recomputeAndSetContactDebt()` ([db/orders.ts](src/db/orders.ts)) - nó tính lại từ timeline visible (orders != cancelled + cash liên kết) nên luôn khớp, chống lệch do edge case.
- **Snapshot:** đơn hàng snapshot giá trị tại thời điểm chốt - `order_items.cost` (tính lãi), `unit_name`/`unit_factor` (đơn vị bán), `orders.snapshot_debt` (nợ cũ trước phiếu). Không tính ngược từ giá hiện tại.
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
