/** Hash mật khẩu bằng SHA-256 (Web Crypto, native trong WebView). */
export async function hashPassword(plain: string): Promise<string> {
  const buf = new TextEncoder().encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
