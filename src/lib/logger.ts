import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

/**
 * Logger nhẹ, không phụ thuộc Rust plugin. Bắt console + lỗi global vào 1
 * ring-buffer trong bộ nhớ để khi app lỗi (kể cả màn hình trắng) user vẫn
 * "Xuất log" ra file gửi hỗ trợ. Buffer sống cùng webview nên còn dữ liệu
 * ngay cả khi React crash (chỉ mất khi đóng hẳn app).
 */

type Level = "log" | "info" | "warn" | "error";
type Entry = { t: string; level: Level; msg: string };

const MAX = 800;
const buf: Entry[] = [];
let installed = false;
let fallbackShown = false;

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

function one(a: unknown): string {
  if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
  if (typeof a === "object" && a !== null) {
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  }
  return String(a);
}

function serialize(args: unknown[]): string {
  // console.error("%s bị lỗi", x) - thay format specifier bằng tham số tương ứng
  // (React dùng kiểu này, nếu giữ nguyên %o/%s log sẽ rất khó đọc).
  if (typeof args[0] === "string" && /%[sdifoOc]/.test(args[0])) {
    const rest = args.slice(1);
    let i = 0;
    const head = args[0].replace(/%[sdifoOc]/g, (m) =>
      m === "%c" ? "" : i < rest.length ? one(rest[i++]) : m,
    );
    return [head, ...rest.slice(i).map(one)].join(" ").trim();
  }
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
      if (typeof a === "object" && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");
}

export function pushLog(level: Level, ...args: unknown[]): void {
  buf.push({ t: stamp(), level, msg: serialize(args) });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
}

/** Gắn 1 lần lúc app khởi động (trước khi render). */
export function installLogger(): void {
  if (installed) return;
  installed = true;

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  (["log", "info", "warn", "error"] as Level[]).forEach((l) => {
    console[l] = (...a: unknown[]) => {
      pushLog(l, ...a);
      orig[l](...a);
    };
  });

  window.addEventListener("error", (e) => {
    pushLog(
      "error",
      "window.onerror:",
      e.message,
      e.error ?? "",
      `${e.filename}:${e.lineno}:${e.colno}`,
    );
    mountCrashFallbackIfBlank();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { stack?: string } | string | undefined;
    pushLog("error", "unhandledrejection:", (r as { stack?: string })?.stack ?? r);
    mountCrashFallbackIfBlank();
  });

  pushLog("info", `App khởi động - ${navigator.userAgent}`);
}

function buildLogText(): string {
  const header = [
    "Sổ Sách - nhật ký lỗi",
    `Thời điểm xuất: ${stamp()}`,
    `Trình duyệt: ${navigator.userAgent}`,
    `URL: ${location.href}`,
    `Số dòng log: ${buf.length}`,
    "".padEnd(60, "="),
  ].join("\n");
  const body = buf
    .map((e) => `[${e.t}] ${e.level.toUpperCase().padEnd(5)} ${e.msg}`)
    .join("\n");
  return `${header}\n${body}\n`;
}

export function getLogText(): string {
  return buildLogText();
}

/**
 * Xuất log ra file .txt qua save dialog (dùng lệnh Rust save_bytes có sẵn),
 * rồi mở file. Nếu dialog lỗi (webview hỏng nặng) thì copy vào clipboard.
 * Trả về true nếu đã ghi file.
 */
export async function exportLog(): Promise<boolean> {
  const text = buildLogText();
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const name =
    `so-sach-log_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.txt`;
  try {
    const target = await save({
      title: "Xuất nhật ký lỗi",
      defaultPath: name,
      filters: [{ name: "Log", extensions: ["txt", "log"] }],
    });
    if (!target) return false;
    const bytes = Array.from(new TextEncoder().encode(text));
    await invoke("save_bytes", { path: target, bytes });
    try {
      await invoke("open_path_in_os", { path: target });
    } catch {
      // mở file không được thì thôi, file đã ghi xong
    }
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // bó tay
    }
    return false;
  }
}

/**
 * Khi React KHÔNG mount được (màn hình trắng: #root rỗng), dựng 1 fallback
 * tối giản bằng DOM thuần (không cần React) kèm nút Xuất log + Tải lại, để user
 * vẫn lấy được log gửi hỗ trợ. Chỉ chạy khi #root rỗng, không đụng app đang chạy.
 */
export function mountCrashFallbackIfBlank(force = false): void {
  const root = document.getElementById("root");
  if (!root) return;
  if (!force && root.childElementCount > 0) return; // React đã render -> ErrorBoundary lo
  if (fallbackShown) return;
  fallbackShown = true;

  root.innerHTML = `
    <div style="max-width:560px;margin:10vh auto;padding:24px;font-family:system-ui,sans-serif;color:#1f2937">
      <h1 style="font-size:20px;font-weight:600;margin:0 0 8px">Ứng dụng gặp lỗi</h1>
      <p style="color:#6b7280;line-height:1.6;margin:0 0 20px">
        Rất tiếc, đã có lỗi khiến màn hình không hiển thị. Vui lòng bấm
        <strong>Xuất log</strong> rồi gửi file cho bộ phận hỗ trợ để được kiểm tra,
        sau đó bấm <strong>Tải lại</strong>.
      </p>
      <div style="display:flex;gap:8px">
        <button id="__so_export_log" style="padding:8px 16px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-size:14px;cursor:pointer">Xuất log</button>
        <button id="__so_reload" style="padding:8px 16px;border-radius:6px;border:1px solid #d1d5db;background:#fff;font-size:14px;cursor:pointer">Tải lại</button>
      </div>
    </div>`;
  document
    .getElementById("__so_export_log")
    ?.addEventListener("click", () => void exportLog());
  document
    .getElementById("__so_reload")
    ?.addEventListener("click", () => location.reload());
}
