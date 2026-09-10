import { describe, expect, it } from "vitest";
import { toCsv, toJson } from "../../src/output/format";
import type { User } from "../../src/types";

const alice: User = { username: "alice", displayName: "Alice", profileUrl: "https://www.instagram.com/alice/" };
const bob: User = { username: "bob", profileUrl: "https://www.instagram.com/bob/" };

describe("toJson", () => {
  it("serialises users as a readable array", () => {
    expect(JSON.parse(toJson([alice, bob]))).toEqual([alice, bob]);
    expect(toJson([alice])).toContain("\n  ");
  });
});

describe("toCsv", () => {
  it("writes a header and one row per user", () => {
    expect(toCsv([alice, bob])).toBe(
      "username,display_name,profile_url\r\n" +
        "alice,Alice,https://www.instagram.com/alice/\r\n" +
        "bob,,https://www.instagram.com/bob/\r\n",
    );
  });

  it("quotes fields containing commas, quotes or newlines", () => {
    const tricky: User = { ...alice, displayName: 'Alice "Al" Smith, Jr.\nLine 2' };

    expect(toCsv([tricky]).split("\r\n")[1]).toBe(
      'alice,"Alice ""Al"" Smith, Jr.\nLine 2",https://www.instagram.com/alice/',
    );
  });

  it("neutralises values a spreadsheet would treat as formulas", () => {
    const rows = toCsv([
      { ...alice, displayName: "=HYPERLINK(\"http://evil\")" },
      { ...alice, displayName: "+1 fitness" },
      { ...alice, displayName: "-" },
      { ...alice, displayName: "@handle" },
    ]).split("\r\n");

    expect(rows[1]).toBe("alice,\"'=HYPERLINK(\"\"http://evil\"\")\",https://www.instagram.com/alice/");
    expect(rows[2]).toBe("alice,'+1 fitness,https://www.instagram.com/alice/");
    expect(rows[3]).toBe("alice,'-,https://www.instagram.com/alice/");
    expect(rows[4]).toBe("alice,'@handle,https://www.instagram.com/alice/");
  });

  it("keeps unicode display names as they are", () => {
    expect(toCsv([{ ...alice, displayName: "Bob Two 🐙" }])).toContain("Bob Two 🐙");
  });
});
