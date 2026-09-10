import type { User } from "../types";
import { toCsv, toJson } from "./format";

export function download(filename: string, content: string, type: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(users: User[], filename = "instascope.json"): void {
  download(filename, toJson(users), "application/json");
}

const UTF8_BOM = String.fromCharCode(0xfeff);

export function downloadCsvText(csv: string, filename: string): void {
  download(filename, UTF8_BOM + csv, "text/csv;charset=utf-8");
}

export function downloadCsv(users: User[], filename = "instascope.csv"): void {
  downloadCsvText(toCsv(users), filename);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
