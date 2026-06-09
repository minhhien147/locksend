/**
 * Nền cố định toàn trang — ảnh (index.css) + lớp gradient phủ.
 * Đặt z-0; nội dung UI nằm trên z-20.
 */
export default function PageBackground() {
  return (
    <div
      className="ls-page-bg fixed inset-0 z-0 pointer-events-none"
      aria-hidden
    />
  );
}
