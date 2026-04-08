import { getNodex } from "../../shared/nodex-host-access";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ColorMode } from "./theme-types";

const STORAGE_COLOR_MODE = "nodex-color-mode";
const LEGACY_PRESET_KEY = "nodex-theme-preset";

/** Temporary: dark/system modes disabled until ready. */
const FORCE_LIGHT_COLOR_MODE = true;

export type { ColorMode };

type ThemeContextValue = {
  colorMode: ColorMode;
  setColorMode: (m: ColorMode) => void;
  /** Resolved after applying system preference */
  resolvedDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredColorMode(): ColorMode {
  if (FORCE_LIGHT_COLOR_MODE) {
    return "light";
  }
  try {
    const v = localStorage.getItem(STORAGE_COLOR_MODE);
    if (v === "light" || v === "dark" || v === "system") {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "system";
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [colorMode, setColorModeState] = useState<ColorMode>(readStoredColorMode);
  const [resolvedDark, setResolvedDark] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_PRESET_KEY);
      if (FORCE_LIGHT_COLOR_MODE) {
        localStorage.setItem(STORAGE_COLOR_MODE, "light");
      }
    } catch {
      /* ignore */
    }
    const legacyStyle = document.getElementById("nodex-preset-overrides");
    if (legacyStyle) {
      legacyStyle.remove();
    }
  }, []);

  const applyDarkClass = useCallback((dark: boolean) => {
    document.documentElement.classList.toggle("dark", dark);
    setResolvedDark(dark);
    window.dispatchEvent(
      new CustomEvent("nodex-theme-resolved", { detail: { isDark: dark } }),
    );
  }, []);

  const setColorMode = useCallback((m: ColorMode) => {
    const next: ColorMode = FORCE_LIGHT_COLOR_MODE ? "light" : m;
    try {
      localStorage.setItem(STORAGE_COLOR_MODE, next);
    } catch {
      /* ignore */
    }
    setColorModeState(next);
  }, []);

  useEffect(() => {
    if (FORCE_LIGHT_COLOR_MODE) {
      applyDarkClass(false);
      return;
    }
    let cancelled = false;
    (async () => {
      if (colorMode === "system") {
        try {
          const dark = await getNodex().getNativeThemeDark();
          if (!cancelled) {
            applyDarkClass(dark);
          }
        } catch {
          if (!cancelled) {
            applyDarkClass(false);
          }
        }
      } else {
        applyDarkClass(colorMode === "dark");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [colorMode, applyDarkClass]);

  useEffect(() => {
    if (FORCE_LIGHT_COLOR_MODE) {
      return;
    }
    const unsub = getNodex().onNativeThemeChanged((isDark: boolean) => {
      if (colorMode === "system") {
        applyDarkClass(isDark);
      }
    });
    return unsub;
  }, [colorMode, applyDarkClass]);

  const value = useMemo(
    () => ({
      colorMode,
      setColorMode,
      resolvedDark,
    }),
    [colorMode, setColorMode, resolvedDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
