/** Minimal RFC-4180 CSV serializer. */
function esc(v: string | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: (string | null | undefined)[][]): string {
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) {
    lines.push(row.map(esc).join(","));
  }
  return lines.join("\r\n");
}

/** First name from an owner/host name string. */
export function firstNameOf(name: string | null | undefined): string {
  if (!name) return "there";
  const n = name.trim().split(/\s+/)[0];
  return n || "there";
}
