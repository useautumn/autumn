import { createContext, useContext, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { type ScrapAdaptMap, useScraps } from "scraps-ui/react";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";

type ThemeMode = "light" | "dark" | "system";
export type ThemePreset = "modern" | "classic" | "cursed" | "scraps";

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

const SCRAPS_COMPONENTS = {
	'[data-slot="card"]': "card",
	'[data-slot="dialog-content"]': "dialog",
	'[data-slot="sheet-content"]': "panel",
	'[data-slot="popover-content"]': "popover",
	'[data-slot="dropdown-menu-content"]': "menu",
	'[data-slot="select-content"]': "menu",
	'[data-slot="tooltip-content"]': "popover",
	'[data-slot="button"]': {
		type: "button",
		mode: "clip",
		reset: false,
	},
	'[data-slot="button"][data-disabled]': {
		type: "button",
		mode: "clip",
		reset: false,
		boil: false,
	},
	'[data-slot="button"][disabled]': {
		type: "button",
		mode: "clip",
		reset: false,
		boil: false,
	},
	'[data-slot="input"]': { type: "input", mode: "clip", reset: false },
	'[data-slot="textarea"]': { type: "input", mode: "clip", reset: false },
	'[data-slot="select-trigger"]': {
		type: "field",
		mode: "clip",
		reset: false,
	},
	'[data-slot="input-group"]': {
		type: "field",
		mode: "clip",
		reset: false,
	},
	'[data-slot="badge"]': { type: "badge", mode: "clip", reset: false },
	'[data-slot="checkbox"]': {
		type: "checkbox",
		mode: "clip",
		reset: false,
	},
	'[data-slot="switch"]': { type: "switch", mode: "clip", reset: false },
	'[data-slot="switch-thumb"]': {
		type: "thumb",
		mode: "clip",
		reset: false,
	},
	'[data-slot="separator-root"]': "separator",
	'[data-slot="dropdown-menu-separator"]': "separator",
	'[data-slot="select-separator"]': "separator",
	'[data-slot="command-separator"]': "separator",
} satisfies ScrapAdaptMap;

function resolveSystemTheme(): "light" | "dark" {
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
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
	const [preset, setPreset] = useLocalStorage<ThemePreset>(
		"theme-preset",
		"classic",
	);
	const [isDark, setIsDark] = useState(() => applyMode(mode));
	useScraps(SCRAPS_COMPONENTS, { enabled: preset === "scraps" });

	useEffect(() => setIsDark(applyMode(mode)), [mode]);

	useEffect(() => {
		const root = document.documentElement;
		root.classList.remove(
			"preset-classic",
			"preset-modern",
			"preset-cursed",
			"preset-scraps",
		);
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
	if (!context) throw new Error("useTheme must be used within a ThemeProvider");
	return context;
}
