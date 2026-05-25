/**
 * Design tokens — palette giữ nguyên, bề mặt phẳng, ít hiệu ứng “template AI”.
 */

export const shell = {
  page:
    "min-h-screen flex flex-col bg-[#e8eaef] text-slate-900 dark:bg-[#0b0d12] dark:text-slate-100",
  /** Nền phải / base — shell.auth; trái đậm hơn một chút qua authAsideBg */
  auth: "min-h-screen flex bg-[#e8eaef] dark:bg-[#0b0d12]",
  authAsideBg:
    "border-r border-slate-200/90 bg-[#f3f4f8] dark:border-slate-800/90 dark:bg-[#0f1219]",
  authAside:
    "hidden lg:flex lg:w-[42%] xl:w-[38%] relative z-20 flex-col justify-between p-10 xl:p-14 bg-transparent",
  authPanel:
    "flex-1 relative z-20 flex items-center justify-center p-6 sm:p-10 " +
    "bg-[#e8eaef] dark:bg-[#0b0d12] lg:bg-transparent",
};

/** Card chính — không gradient */
export const surfaceCard =
  "rounded-lg border border-slate-200/90 bg-white shadow-sm " +
  "dark:border-slate-800 dark:bg-[#111318] dark:shadow-none";

export const surfaceCardAdmin = surfaceCard;

export const surfaceInset =
  "rounded-md border border-slate-200 bg-slate-50/80 " +
  "dark:border-slate-800 dark:bg-slate-900/40";

export const inputBase =
  "w-full rounded-md px-3 py-2 text-sm " +
  "bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 " +
  "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 " +
  "disabled:opacity-50 disabled:bg-slate-50 " +
  "dark:bg-[#14161e] dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 " +
  "dark:focus:border-indigo-500 dark:focus:ring-indigo-500/25";

export const btnGhost =
  "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 " +
  "dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800/50";

export const keyField =
  "rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-mono text-slate-800 break-all " +
  "dark:border-slate-700 dark:bg-[#0c0e14] dark:text-slate-200";

export const text = {
  primary: "text-slate-900 dark:text-slate-100",
  secondary: "text-slate-600 dark:text-slate-300",
  muted: "text-slate-500 dark:text-slate-400",
  faint: "text-slate-400 dark:text-slate-500",
  onBrand: "text-slate-700 dark:text-slate-200",
};

export const header = {
  bar:
    "sticky top-0 z-50 border-b border-slate-200/90 bg-white/95 backdrop-blur-sm " +
    "dark:border-slate-800 dark:bg-[#0b0d12]/95",
  footer: "border-t border-slate-200 py-4 text-center dark:border-slate-800",
  divider: "border-slate-200 dark:border-slate-800",
};

export const nav = {
  inactive:
    "text-slate-600 hover:text-slate-900 hover:bg-slate-100 " +
    "dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60",
  inactiveDanger:
    "text-slate-600 hover:text-rose-700 hover:bg-rose-50 " +
    "dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/40",
  active:
    "bg-slate-100 text-slate-900 font-medium " +
    "dark:bg-slate-800 dark:text-slate-100",
  activeDanger:
    "bg-rose-50 text-rose-800 font-medium " +
    "dark:bg-rose-950/50 dark:text-rose-300",
};

export const panel = {
  subtle:
    "bg-slate-50 border border-slate-200 " +
    "dark:bg-slate-900/50 dark:border-slate-800",
  hover: "hover:border-slate-300 dark:hover:border-slate-600",
  dropdown:
    "rounded-md border border-slate-200 bg-white shadow-lg " +
    "dark:border-slate-700 dark:bg-[#14161e]",
};

export const orb = {
  indigo: "bg-indigo-500/[0.04] dark:bg-indigo-600/[0.06]",
  violet: "bg-violet-500/[0.03] dark:bg-violet-600/[0.04]",
  sky: "bg-sky-500/[0.03] dark:bg-sky-600/[0.03]",
};

export const brand = {
  lock: "text-slate-900 dark:text-slate-100",
  send: "text-indigo-600 dark:text-indigo-400",
};

export const label =
  "text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";

export const sectionTitle = "text-base font-semibold text-slate-900 dark:text-slate-100";

export const pageTitle = "text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100";

export const pageDesc = "text-sm text-slate-500 dark:text-slate-400 mt-1";

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium " +
    "bg-indigo-600 text-white hover:bg-indigo-700 " +
    "disabled:opacity-50 disabled:pointer-events-none transition-colors",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium " +
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 " +
    "dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800 " +
    "disabled:opacity-50 transition-colors",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium " +
    "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 " +
    "dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium " +
    "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors",
};

export const badge = {
  neutral:
    "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " +
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  success:
    "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " +
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  warning:
    "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " +
    "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  danger:
    "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " +
    "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  info:
    "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " +
    "bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300",
};

export const alert = {
  info:
    "rounded-md border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 " +
    "dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  warning:
    "rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 " +
    "dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
  error:
    "rounded-md border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800 " +
    "dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300",
  success:
    "rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900 " +
    "dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
};

export const dropzone = {
  base:
    "rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 transition-colors " +
    "dark:border-slate-700 dark:bg-slate-900/20",
  active: "border-indigo-400 bg-indigo-50/30 dark:border-indigo-600 dark:bg-indigo-950/20",
  filled:
    "border-slate-300 bg-white dark:border-slate-600 dark:bg-[#111318]",
};

export const tabs = {
  wrap: "inline-flex p-0.5 rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60",
  item:
    "px-3 py-1.5 rounded-[5px] text-sm font-medium text-slate-600 transition-colors " +
    "dark:text-slate-400",
  itemActive:
    "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100",
};

export const table = {
  wrap: "overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800",
  head: "text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 bg-slate-50 dark:bg-slate-900/60 dark:text-slate-400",
  row: "border-t border-slate-100 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/30",
  cell: "px-4 py-3 text-sm text-slate-700 dark:text-slate-300",
};

export const linkAccent =
  "text-indigo-600 hover:text-indigo-800 font-medium dark:text-indigo-400 dark:hover:text-indigo-300";
