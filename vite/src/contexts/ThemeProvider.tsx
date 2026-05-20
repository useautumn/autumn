import { createContext, useContext, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";

type ThemeMode = "light" | "dark" | "system";
type ThemePreset = "modern" | "classic";

interface ThemeContextType {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
	preset: ThemePreset;
	setPreset: (preset: ThemePreset) => void;
	isDark: boolean;
	/** @deprecated Use `mode` instead */
	theme: ThemeMode;
	/** @deprecated Use `setMode` instead */
	setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [mode, setMode] = useLocalStorage<ThemeMode>("theme", "system");
	const [preset, setPreset] = useLocalStorage<ThemePreset>("theme-preset", "classic");
	const [isDark, setIsDark] = useState(false);

	useEffect(() => {
		const root = document.documentElement;
		root.classList.remove("light", "dark");

		if (mode === "system") {
			const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
				.matches
				? "dark"
				: "light";
			root.classList.add(systemTheme);
			setIsDark(systemTheme === "dark");
		} else {
			root.classList.add(mode);
			setIsDark(mode === "dark");
		}
	}, [mode]);

	useEffect(() => {
		const root = document.documentElement;
		root.classList.remove("preset-classic", "preset-modern");
		root.classList.add(`preset-${preset}`);
	}, [preset]);

	useEffect(() => {
		if (mode !== "system") return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = (e: MediaQueryListEvent) => {
			const root = document.documentElement;
			root.classList.remove("light", "dark");
			root.classList.add(e.matches ? "dark" : "light");
			setIsDark(e.matches);
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, [mode]);

	useHotkeys("t", () => setMode(isDark ? "light" : "dark"), {
		enabled: import.meta.env.DEV,
		enableOnFormTags: false,
	});

	return (
		<ThemeContext.Provider
			value={{
				mode,
				setMode,
				preset,
				setPreset,
				isDark,
				theme: mode,
				setTheme: setMode,
			}}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
