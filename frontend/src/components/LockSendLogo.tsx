/**
 * LockSend — biểu trưng (mây + khiên + chìa) từ /public/locksend-mark.png
 * Ảnh có nền trắng → bọc khung trắng bo góc để đặt trên nền tối.
 */

/** Header / mobile — mark nhỏ */
export function LockSendMark({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <div className="rounded-lg bg-white p-1 shrink-0 shadow-sm shadow-black/20 dark:ring-1 dark:ring-white/10">
      <img
        src="/locksend-mark.png"
        alt="LockSend"
        width={28}
        height={28}
        className={`block object-contain ${className}`}
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src.endsWith("/favicon.svg")) return;
          img.src = "/favicon.svg";
        }}
      />
    </div>
  );
}

/** Panel trái login/register — mark + LockSend */
export function LockSendLogoHero() {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl bg-white/[0.94] p-2 shadow-sm shadow-black/30">
        <img
          src="/locksend-mark.png"
          alt=""
          className="h-11 w-auto object-contain block"
          aria-hidden
        />
      </div>
      <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Lock<span className="text-blue-800 dark:text-blue-500">Send</span>
      </span>
    </div>
  );
}

/** Phiên bản đầy đủ cũ (composite có chữ trong ảnh) — giữ nếu cần tham chiếu */
export function LockSendLogoFull({ className = "w-52 max-w-full h-auto" }: { className?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-md px-6 py-5 mx-auto">
      <img
        src="/locksend-logo.png"
        alt="LockSend — Only you hold the key"
        className={`block mx-auto ${className}`}
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}
