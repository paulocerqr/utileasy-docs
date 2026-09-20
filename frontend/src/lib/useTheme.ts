import { useEffect, useLayoutEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "utileasydoc-theme";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function useTheme() {
  const [choice, setChoice] = useState<Theme | null>(storedTheme);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.(DARK_MEDIA_QUERY).matches ?? false,
  );
  const theme: Theme = choice ?? (systemDark ? "dark" : "light");

  useEffect(() => {
    const media = window.matchMedia?.(DARK_MEDIA_QUERY);
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) =>
      setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setChoice(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // O tema continua ativo nesta sessão quando o armazenamento está indisponível.
    }
  }

  return { theme, toggleTheme };
}
