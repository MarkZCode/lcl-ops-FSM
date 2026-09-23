"use client";

// Vertical section nav with a hooked rail that tracks the active item.
//
// ── HOW TO PLACE THIS ───────────────────────────────────────────────────
//
// The rail is drawn INSIDE the list at left: 2px, and every row carries
// pl-5 to leave it room. So the column needs ~20px of left gutter that
// isn't used for text; don't remove the padding to fit more label in.
// Nothing is drawn outside the list box (the corner SVG spans x 2→14 of a
// 200px column), so a clipping ancestor is harmless.
//
// Row centres are measured with offsetTop, which is relative to the
// nearest positioned ancestor — the list container is `relative`, so that
// must stay. A ResizeObserver re-measures when the list changes size,
// which also fires once on observe, so the first paint is correct.
//
// ── PORT NOTES ──────────────────────────────────────────────────────────
//
// The original was written against shadcn's `foreground` colour token.
// This project has no such token (see tailwind.config.js — the palette is
// navy/brand), so every `text-foreground/50` would have been dropped by
// Tailwind and the rows and hover rail would have rendered in whatever
// colour they inherited. Mapped to navy/slate, with the accent defaulting
// to the LCL brand green rather than the original orange.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const CORNER = 6;
const DASH =
  "repeating-linear-gradient(to top, transparent 0 2px, currentColor 2px 4px)";

const hrefOf = (item) => (typeof item === "string" ? undefined : item.href);
const labelOf = (item) => (typeof item === "string" ? item : item.label);

const Rail = ({ from = 0, y, visible, color, dashed, className }) => {
  const reduced = useReducedMotion();
  const travel = reduced
    ? { duration: 0 }
    : { type: "spring", stiffness: 420, damping: 34, mass: 0.7 };

  return (
    <motion.span
      aria-hidden
      initial={false}
      style={{ color }}
      animate={{ opacity: visible && y !== null ? 1 : 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.2 }}
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      <motion.span
        initial={false}
        animate={{ top: from, height: Math.max(0, (y ?? 0) - CORNER - from) }}
        transition={travel}
        style={dashed ? { backgroundImage: DASH } : { backgroundColor: "currentColor" }}
        className="absolute left-0.5 w-px"
      />
      <motion.svg
        initial={false}
        animate={{ top: (y ?? 0) - CORNER }}
        transition={travel}
        width="12"
        height="7"
        viewBox="0 0 12 7"
        fill="none"
        className="absolute left-0.5"
      >
        <path
          d="M0.5 0a6 6 0 0 0 6 6H12"
          stroke="currentColor"
          strokeDasharray={dashed ? "2 2" : undefined}
        />
      </motion.svg>
    </motion.span>
  );
};

export function HookSidebar({
  items,
  label,
  value,
  defaultValue = 0,
  onChange,
  color = "#3fa34d", // brand-500, not the original orange
  dashed = true,
  className,
  ...props
}) {
  const pathname = usePathname();
  const listRef = useRef(null);
  const itemRefs = useRef([]);
  const [centers, setCenters] = useState([]);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);

  const routed = items.some((item) => hrefOf(item));
  const routeIndex = items.findIndex((item) => hrefOf(item) === pathname);
  const activeIndex = value ?? (routed ? routeIndex : internalValue);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () =>
      setCenters(itemRefs.current.map((el) => (el ? el.offsetTop + el.offsetHeight / 2 : 0)));

    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [items.length]);

  const activeY = activeIndex < 0 ? null : centers[activeIndex] ?? null;
  const hoverY = hoverIndex === null ? null : centers[hoverIndex] ?? null;

  // above the active row the accent line already covers the span, so draw only the corner
  const hoverFrom =
    activeY !== null && hoverY !== null && hoverY <= activeY
      ? Math.max(0, hoverY - CORNER)
      : activeY ?? 0;

  const select = (index) => {
    if (value === undefined) setInternalValue(index);
    onChange?.(index);
  };

  return (
    <nav
      data-slot="hook-sidebar"
      aria-label={label}
      className={cn("flex flex-col", className)}
      {...props}
    >
      {label && (
        <span
          data-slot="hook-sidebar-label"
          className="pb-3 pl-0.5 pr-2 text-[10px] font-bold uppercase tracking-[0.14em] text-navy-400"
        >
          {label}
        </span>
      )}

      <div
        ref={listRef}
        onMouseLeave={() => setPointerInside(false)}
        className="relative flex flex-col gap-0.5"
      >
        <Rail
          from={hoverFrom}
          y={hoverY}
          visible={(pointerInside || focusInside) && hoverIndex !== activeIndex}
          dashed={dashed}
          className="text-navy-300 dark:text-slate-600"
        />
        <Rail y={activeY} visible={activeY !== null} color={color} dashed={dashed} />

        {items.map((item, index) => {
          const text = labelOf(item);
          const href = hrefOf(item);
          const isActive = index === activeIndex;
          const setRef = (el) => {
            itemRefs.current[index] = el;
          };
          const rowProps = {
            "data-slot": "hook-sidebar-item",
            "data-active": isActive,
            onMouseEnter: () => {
              setHoverIndex(index);
              setPointerInside(true);
            },
            onFocus: () => {
              setHoverIndex(index);
              setFocusInside(true);
            },
            onBlur: () => setFocusInside(false),
            onClick: () => select(index),
            className: cn(
              "rounded-lg py-1.5 pl-5 pr-2 text-left text-sm transition-colors duration-200 motion-reduce:transition-none",
              isActive
                ? "font-semibold text-navy-900 dark:text-slate-100"
                : "text-navy-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-200"
            ),
          };

          return href ? (
            <Link
              key={`${index}-${text}`}
              {...rowProps}
              ref={setRef}
              href={href}
              aria-current={isActive ? "page" : undefined}
            >
              {text}
            </Link>
          ) : (
            <button
              key={`${index}-${text}`}
              {...rowProps}
              ref={setRef}
              type="button"
              aria-current={isActive ? "true" : undefined}
            >
              {text}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default HookSidebar;
