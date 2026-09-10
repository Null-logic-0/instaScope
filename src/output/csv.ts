export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

export function serializeCsv<T>(rows: Iterable<T>, columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((column) => csvField(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvField(formatValue(column.value(row)))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvField(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTING.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function formatValue(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}
