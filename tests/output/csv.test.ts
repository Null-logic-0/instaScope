import { describe, expect, it } from "vitest";
import { csvField, serializeCsv, type CsvColumn } from "../../src/output/csv";

interface Row {
  name: string;
  note?: string | null;
  score?: number;
  active?: boolean;
}

const columns: CsvColumn<Row>[] = [
  { header: "name", value: (row) => row.name },
  { header: "note", value: (row) => row.note },
  { header: "score", value: (row) => row.score },
  { header: "active", value: (row) => row.active },
];

const lines = (csv: string) => csv.split("\r\n");

describe("serializeCsv", () => {
  it("writes a header row, CRLF line endings and a trailing newline", () => {
    const csv = serializeCsv([{ name: "alice", note: "hi", score: 1, active: true }], columns);

    expect(csv).toBe("name,note,score,active\r\nalice,hi,1,true\r\n");
  });

  it("writes an empty dataset as just the header", () => {
    expect(serializeCsv([], columns)).toBe("name,note,score,active\r\n");
  });

  it("quotes fields containing commas", () => {
    expect(lines(serializeCsv([{ name: "Doe, Jane" }], columns))[1]).toBe('"Doe, Jane",,,');
  });

  it("doubles embedded quotes and quotes the field", () => {
    expect(lines(serializeCsv([{ name: 'say "hi"' }], columns))[1]).toBe('"say ""hi""",,,');
  });

  it("keeps newlines inside a quoted field", () => {
    const csv = serializeCsv([{ name: "line 1\nline 2", note: "a\r\nb" }], columns);

    expect(csv).toBe('name,note,score,active\r\n"line 1\nline 2","a\r\nb",,\r\n');
  });

  it("passes unicode through untouched", () => {
    const csv = serializeCsv([{ name: "Bob Two 🐙", note: "מרים — 𝐵𝑒𝑎𝑢𝑇𝑖𝑓𝑢𝐿" }], columns);

    expect(lines(csv)[1]).toBe("Bob Two 🐙,מרים — 𝐵𝑒𝑎𝑢𝑇𝑖𝑓𝑢𝐿,,");
  });

  it("renders null, undefined and empty strings as empty fields", () => {
    expect(lines(serializeCsv([{ name: "", note: null }], columns))[1]).toBe(",,,");
  });

  it("renders numbers and booleans without quoting", () => {
    expect(lines(serializeCsv([{ name: "n", score: 0.91, active: false }], columns))[1]).toBe("n,,0.91,false");
  });

  it("neutralises values a spreadsheet would run as formulas", () => {
    const rows = [{ name: "=1+1" }, { name: "+tel" }, { name: "-dash" }, { name: "@user" }];

    expect(lines(serializeCsv(rows, columns)).slice(1, 5)).toEqual(["'=1+1,,,", "'+tel,,,", "'-dash,,,", "'@user,,,"]);
  });

  it("escapes headers by the same rules", () => {
    const csv = serializeCsv([], [{ header: 'first, "name"', value: () => "" }]);

    expect(csv).toBe('"first, ""name"""\r\n');
  });

  it("accepts any iterable, not only arrays", () => {
    function* rows(): Generator<Row> {
      yield { name: "a" };
      yield { name: "b" };
    }

    expect(lines(serializeCsv(rows(), columns))).toEqual(["name,note,score,active", "a,,,", "b,,,", ""]);
  });

  it("handles a large dataset in one pass", () => {
    const count = 100_000;
    const rows = Array.from({ length: count }, (_, i) => ({ name: `user${i}`, note: i % 7 === 0 ? "a, b" : "", score: i }));

    const csv = serializeCsv(rows, columns);

    expect(lines(csv)).toHaveLength(count + 2);
    expect(lines(csv)[8]).toBe('user7,"a, b",7,');
    expect(lines(csv)[count]).toBe(`user${count - 1},,${count - 1},`);
  });
});

describe("csvField", () => {
  it.each([
    ["plain", "plain"],
    ["", ""],
    ["a,b", '"a,b"'],
    ['a"b', '"a""b"'],
    ["a\nb", '"a\nb"'],
    ["\tlead", "'\tlead"],
  ])("formats %j as %j", (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });
});
