"use client";

import { useEffect, useState } from "react";
import { FiSun, FiMoon } from "react-icons/fi";

const STORAGE_KEY = "lcl-theme";

// Icon-only theme toggle. `className` should match the surrounding
// icon-button styling (see usages in Sidebar/BottomNav).
export default function ThemeToggle({ className = "" }) {
  const [dark, setDark] = useState(null); // null until mounted — avoids hydration mismatch

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    
    // Sync status bar color on iOS
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute("content", next ? "#0a0a0a" : "#f6f6f7");
    }

    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {}
  };

  if (dark === null) return <span className={className} aria-hidden="true" />;

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <FiSun className="h-[18px] w-[18px]" /> : <FiMoon className="h-[18px] w-[18px]" />}
    </button>
  );
}
