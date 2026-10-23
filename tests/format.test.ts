import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phoneHref, whatsappNumber } from "@/utils/format";

describe("phone links", () => {
  it("turns a local Pakistani number into a WhatsApp number with the country code", () => {
    assert.equal(whatsappNumber("0333-1000001"), "923331000001");
    assert.equal(whatsappNumber("+92 333 1000001"), "923331000001");
    assert.equal(whatsappNumber("0092 333 1000001"), "923331000001");
    assert.equal(whatsappNumber("923331000001"), "923331000001");
  });

  it("builds a tel link without spaces or dashes", () => {
    assert.equal(phoneHref("0333-100 0001"), "tel:03331000001");
  });
});
