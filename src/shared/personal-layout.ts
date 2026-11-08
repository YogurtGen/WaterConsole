export interface PersonalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type PersonalLayout = Record<string, PersonalRect>;
export function fitPersonalRect(
  r: PersonalRect,
  width: number,
  height: number,
  min = 44,
): PersonalRect {
  const scale = Math.min(
    1,
    width / Math.max(min, r.w),
    height / Math.max(min, r.h),
  );
  const w = Math.min(width, Math.max(min, r.w) * scale),
    h = Math.min(height, Math.max(min, r.h) * scale);
  return {
    x: Math.max(0, Math.min(width - w, r.x)),
    y: Math.max(0, Math.min(height - h, r.y)),
    w,
    h,
  };
}
export function readPersonalLayout(text: string | null): PersonalLayout {
  try {
    const v = JSON.parse(text ?? "{}");
    if (!v || Array.isArray(v) || typeof v !== "object") return {};
    return Object.fromEntries(
      Object.entries(v)
        .filter(
          ([k, r]: [string, any]) =>
            k.length < 180 &&
            r &&
            ["x", "y", "w", "h"].every((p) => Number.isFinite(r[p])) &&
            r.x >= 0 &&
            r.y >= 0 &&
            r.w > 0 &&
            r.h > 0 &&
            r.x <= 1 &&
            r.y <= 1 &&
            r.w <= 1 &&
            r.h <= 1,
        )
        .slice(0, 64),
    ) as PersonalLayout;
  } catch {
    return {};
  }
}
