/**
 * api.ts — Compatibility re-export.
 * File này giữ lại để không break các import hiện tại.
 * Toàn bộ logic đã được chuyển vào utils/api/ (domain modules).
 *
 * @deprecated Hãy import trực tiếp từ "./api/" thay vì "./api.ts"
 */
export * from "./api/index";
export { default } from "./api/client";
