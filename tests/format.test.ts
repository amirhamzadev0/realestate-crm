import { canonicalPhone } from "@/utils/phone";
import { today } from "@/utils/id";
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
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

describe("phone numbers from Excel and other formats", () => {
  it("recognises one number written in different ways", () => {
    for (const written of ["0300-1234567", "03001234567", "+92 300 1234567", "0092 300 1234567", "3001234567", "(0300) 123 4567"]) {
      assert.equal(canonicalPhone(written), "03001234567", written);
    }
    assert.equal(canonicalPhone("042-35761234"), "04235761234"); // a landline stays as it is
    assert.equal(canonicalPhone("+1 415 555 0123"), "14155550123"); // so does a foreign number
  });

  it("builds the right WhatsApp number and call link when Excel has dropped the leading 0", () => {
    assert.equal(whatsappNumber("3001234567"), "923001234567");
    assert.equal(whatsappNumber("+1 415 555 0123"), "14155550123");
    assert.equal(phoneHref("3001234567"), "tel:03001234567");
    assert.equal(phoneHref("+92 300 1234567"), "tel:+923001234567");
  });
});

describe("today in Pakistan", () => {
  it("is the Pakistani calendar day, not the UTC one", () => {
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-28T20:30:00Z") }); // 1:30 am on 29 October in Pakistan
    try {
      assert.equal(today(), "2026-10-29");
      mock.timers.setTime(new Date("2026-10-28T18:59:00Z").getTime()); // 11:59 pm on 28 October
      assert.equal(today(), "2026-10-28");
    } finally {
      mock.timers.reset();
    }
  });
});

