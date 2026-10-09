import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "Dverif_theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    const saved = (window.localStorage.getItem(KEY) as Theme | null) ?? "light";
    setThemeState(saved);
    apply(saved);
  }, []);
  const setTheme = (t: Theme) => {
    setThemeState(t);
    window.localStorage.setItem(KEY, t);
    apply(t);
  };
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");
  return { theme, setTheme, toggle };
}
