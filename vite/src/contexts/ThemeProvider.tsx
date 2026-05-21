import { createContext, useContext, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";

type ThemeMode = "light" | "dark" | "system";
export type ThemePreset = "modern" | "classic" | "cursed";

interface ThemeContextType {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
	preset: ThemePreset;
	setPreset: (preset: ThemePreset) => void;
	isDark: boolean;
	/** @deprecated Use `mode` */
	theme: ThemeMode;
	/** @deprecated Use `setMode` */
	setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function resolveSystemTheme(): "light" | "dark" {
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyMode(mode: ThemeMode): boolean {
	const root = document.documentElement;
	root.classList.remove("light", "dark");
	const resolved = mode === "system" ? resolveSystemTheme() : mode;
	root.classList.add(resolved);
	return resolved === "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [mode, setMode] = useLocalStorage<ThemeMode>("theme", "system");
	const [preset, setPreset] = useLocalStorage<ThemePreset>("theme-preset", "classic");
	const [isDark, setIsDark] = useState(() => applyMode(mode));

	useEffect(() => setIsDark(applyMode(mode)), [mode]);

	useEffect(() => {
		const root = document.documentElement;
		root.classList.remove("preset-classic", "preset-modern", "preset-cursed");
		root.classList.add(`preset-${preset}`);
	}, [preset]);

	useEffect(() => {
		if (mode !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => setIsDark(applyMode("system"));
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [mode]);

	useHotkeys("t", () => setMode(isDark ? "light" : "dark"), {
		enabled: import.meta.env.DEV,
		enableOnFormTags: false,
	});

	return (
		<ThemeContext.Provider
			value={{ mode, setMode, preset, setPreset, isDark, theme: mode, setTheme: setMode }}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) throw new Error("useTheme must be used within a ThemeProvider");
	return context;
}
