"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { JSX, ReactNode } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "./theme-constants";

export type Theme = "light" | "dark" | "system";

export interface ThemeContextValue {
	theme: Theme;
	resolvedTheme: "light" | "dark";
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isTheme(value: unknown): value is Theme {
	return value === "light" || value === "dark" || value === "system";
}

export interface ThemeProviderProps {
	children: ReactNode;
	defaultTheme?: Theme;
}

export function ThemeProvider({
	children,
	defaultTheme = DEFAULT_THEME,
}: ThemeProviderProps): JSX.Element {
	// Start from the default on both server and client so hydration matches;
	// the saved value is read after mount. `ThemeScript` has already applied
	// the saved theme to <html> before paint, so nothing flashes meanwhile.
	const [theme, setThemeState] = useState<Theme>(defaultTheme);
	const [isHydrated, setIsHydrated] = useState<boolean>(false);
	const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

	useEffect(() => {
		try {
			const saved = localStorage.getItem(THEME_STORAGE_KEY);
			if (isTheme(saved)) setThemeState(saved);
		} catch (error) {
			console.error("[theme] Could not read saved theme:", error);
		}
		setIsHydrated(true);
	}, []);

	// Listen to system theme changes
	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		setSystemTheme(mediaQuery.matches ? "dark" : "light");

		const listener = (e: MediaQueryListEvent) => {
			setSystemTheme(e.matches ? "dark" : "light");
		};

		mediaQuery.addEventListener("change", listener);
		return () => mediaQuery.removeEventListener("change", listener);
	}, []);

	const resolvedTheme = useMemo<"light" | "dark">(() => {
		if (theme === "system") return systemTheme;
		return theme;
	}, [theme, systemTheme]);

	// Apply class and data-theme attribute. Skipped until the saved theme has
	// been read, otherwise the first pass would briefly undo ThemeScript.
	useEffect(() => {
		if (!isHydrated) return;
		const root = document.documentElement;
		const isDark = resolvedTheme === "dark";
		root.classList.toggle("dark", isDark);
		root.setAttribute("data-theme", resolvedTheme);
	}, [resolvedTheme, isHydrated]);

	const setTheme = useCallback((newTheme: Theme) => {
		setThemeState(newTheme);
		try {
			localStorage.setItem(THEME_STORAGE_KEY, newTheme);
		} catch (error) {
			console.error("[theme] Could not save theme:", error);
		}
	}, []);

	const toggleTheme = useCallback(() => {
		setTheme(resolvedTheme === "dark" ? "light" : "dark");
	}, [resolvedTheme, setTheme]);

	const value = useMemo(
		() => ({
			theme,
			resolvedTheme,
			setTheme,
			toggleTheme,
		}),
		[theme, resolvedTheme, setTheme, toggleTheme],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
