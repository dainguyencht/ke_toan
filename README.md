# Kế Toán - Quản lý hộ kinh doanh

Ứng dụng desktop (Windows + macOS) dành cho hộ kinh doanh bán lẻ nhỏ. Quản lý
sản phẩm, kho tồn, đơn hàng, khách hàng, công nợ, sổ quỹ và báo cáo cơ bản.

## Tech stack

- **Tauri 2** (Rust + WebView native) - shell desktop
- **React 19 + TypeScript** + Vite
- **Tailwind CSS v4**
- **SQLite** qua `@tauri-apps/plugin-sql` - lưu local, không cần server
- **TanStack Query** + **Zustand** - state
- **React Router** - điều hướng

## Yêu cầu

- Node.js 18+ (project test với Node 20)
- Rust toolchain (stable, cài qua `rustup`)
- Xcode CLT (macOS) hoặc MSVC Build Tools (Windows)

## Chạy dev

```bash
npm install
npm run tauri dev
```

DB sẽ được tạo tự động tại thư mục data của app:

- macOS: `~/Library/Application Support/com.ketoan.app/ke_toan.db`
- Windows: `%APPDATA%\com.ketoan.app\ke_toan.db`

## Build production

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

## Cấu trúc thư mục

```
src/
  pages/         màn hình (Dashboard, Products, Orders, ...)
  components/    UI tái dùng (Sidebar, ...)
  db/            client SQLite, queries
  domain/        types, business logic (tính tiền, trừ kho, ...)
  hooks/         custom React hooks
  store/         Zustand stores
  lib/           utils chung (cn, format VND, format ngày, ...)

src-tauri/
  src/           Rust backend
  migrations/    SQL migrations (chạy tự động khi app khởi động)
  capabilities/  permissions cho frontend gọi plugin
```
