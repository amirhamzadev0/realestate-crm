/**
 * A phone number in one standard shape, so the same person written different ways is recognised as one: 0300-1234567,
 * 03001234567, +92 300 1234567, 0092 300 1234567 and 3001234567 (Excel drops the leading 0 of a number) all become 03001234567.
 * A number that is not a Pakistani mobile or landline written in one of those ways comes back as its digits only.
 */
export function canonicalPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("92") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("3")) return `0${digits}`;
  return digits;
}

/** The number WhatsApp wants: country code first, no plus and no leading 0 (a Pakistani 0300... becomes 92300...). */
export function whatsappDigits(phone: string): string {
  const digits = canonicalPhone(phone);
  return digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
}
