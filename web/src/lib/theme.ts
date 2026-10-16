import { useState } from "react";

export type Theme = "system" | "light" | "dark";

// Same key as the inline script in index.html, which applies the theme before the first paint.
const KEY = "lecture-lens-theme";

export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** "system" removes the override so the OS setting decides; light and dark pin it. */
export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // not remembered; it still applies for this visit
  }
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  return [
    theme,
    (t) => {
      applyTheme(t);
      setTheme(t);
    },
  ];
}
