import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCsv } from "@/utils/csv";

describe("csv", () => {
  it("quotes commas, quotes and line breaks, and starts with a byte-order mark for Excel", () => {
    const csv = toCsv([["Name", "Note"], ["A, B", 'say "hi"'], ["Line\nbreak", 5]]);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.equal(csv.slice(1), 'Name,Note\r\n"A, B","say ""hi"""\r\n"Line\nbreak",5\r\n');
  });

  it("stops text typed into the system from running as a formula, but keeps real numbers", () => {
    const csv = toCsv([["=SUM(A1)", "+1", "-1", "@cmd", -5, null, undefined]]);
    assert.equal(csv.slice(1), "'=SUM(A1),'+1,'-1,'@cmd,-5,,\r\n");
  });
});
