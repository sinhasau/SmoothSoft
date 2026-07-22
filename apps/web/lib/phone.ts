/** Formats North American phone input while leaving international numbers intact. */
export function formatPhoneInput(value: string) {
  if (value.trimStart().startsWith('+')) return value;
  const digits = value.replace(/\D/g, '');
  if (digits.length > 11 || (digits.length === 11 && !digits.startsWith('1'))) return value;
  const country = digits.length === 11 ? '1-' : '';
  const local = digits.length === 11 ? digits.slice(1) : digits;
  if (local.length <= 3) return `${country}${local}`;
  if (local.length <= 6) return `${country}${local.slice(0, 3)}-${local.slice(3)}`;
  return `${country}${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6, 10)}`;
}
