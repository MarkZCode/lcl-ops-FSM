// Join class names, dropping anything falsy.
//
// This is the `cn` that shadcn-style components import from "@/lib/utils".
// The usual implementation wraps clsx + tailwind-merge, which exists to
// resolve CONFLICTING Tailwind classes (a later `p-4` beating an earlier
// `p-2`). Nothing in this codebase relies on that — components here take a
// `className` that ADDS to their own rather than overriding it — so this
// stays dependency-free rather than pulling in two packages for a feature
// that isn't used. If a component ever genuinely needs conflict
// resolution, swap this for twMerge(clsx(...)) and every call site keeps
// working unchanged.
export function cn(...parts) {
  const out = [];
  const walk = (part) => {
    if (!part) return;
    if (typeof part === "string" || typeof part === "number") {
      out.push(String(part));
    } else if (Array.isArray(part)) {
      part.forEach(walk);
    } else if (typeof part === "object") {
      for (const [key, on] of Object.entries(part)) if (on) out.push(key);
    }
  };
  parts.forEach(walk);
  return out.join(" ");
}

export default cn;
