/** Email hợp lệ để nhận cảnh báo (khớp logic backend). */
export function isValidAlertEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
