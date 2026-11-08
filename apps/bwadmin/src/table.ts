import { CliUtils } from "@bitwarden/cli/utils";

const writeLn = CliUtils.writeLn;

export interface TableColumn<T> {
  header: string;
  value: (item: T) => string;
}

/** Renders rows as a padded table on stdout, used for default (non-raw) list output. */
export function writeTable<T>(columns: TableColumn<T>[], rows: T[]) {
  const cells = rows.map((row) => columns.map((c) => c.value(row)));
  const widths = columns.map((c, i) => Math.max(c.header.length, ...cells.map((r) => r[i].length)));
  const line = (values: string[]) =>
    values
      .map((v, i) => v.padEnd(widths[i]))
      .join("  ")
      .trimEnd();

  writeLn(line(columns.map((c) => c.header)));
  writeLn(widths.map((w) => "-".repeat(w)).join("  "));
  cells.forEach((row) => writeLn(line(row)));
}
