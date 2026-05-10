import type { Monaco } from "@monaco-editor/react";

export const AUTUMN_LIGHT = "autumn-light";
export const AUTUMN_DARK = "autumn-dark";

function getCssVar(name: string): string {
	return getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
}

function stripHash(color: string): string {
	return color.startsWith("#") ? color.slice(1) : color;
}

let registered = false;

export function registerAutumnThemes(monaco: Monaco) {
	if (registered) return;
	registered = true;

	const bg = getCssVar("--background") || "#fafaf9";
	const fg = getCssVar("--foreground") || "#121212";
	const muted = getCssVar("--muted") || "#f2f2f2";
	const border = getCssVar("--border") || "#e5e5e5";
	const primary = getCssVar("--primary") || "#8838ff";

	monaco.editor.defineTheme(AUTUMN_LIGHT, {
		base: "vs",
		inherit: true,
		rules: [
			{ token: "comment", foreground: "a3a3a3", fontStyle: "italic" },
			{ token: "keyword", foreground: stripHash(primary) },
			{ token: "string", foreground: "16a34a" },
			{ token: "number", foreground: "d97706" },
			{ token: "delimiter", foreground: "737373" },
			{ token: "type", foreground: "2563eb" },
		],
		colors: {
			"editor.background": bg,
			"editor.foreground": fg,
			"editor.lineHighlightBackground": muted,
			"editorLineNumber.foreground": "#a3a3a3",
			"editorLineNumber.activeForeground": "#737373",
			"editor.selectionBackground": `${primary}20`,
			"editor.inactiveSelectionBackground": `${primary}10`,
			"editorCursor.foreground": fg,
			"editorWhitespace.foreground": border,
			"editorIndentGuide.background": border,
			"editorIndentGuide.activeBackground": "#d4d4d4",
		},
	});

	monaco.editor.defineTheme(AUTUMN_DARK, {
		base: "vs-dark",
		inherit: true,
		rules: [
			{ token: "comment", foreground: "525252", fontStyle: "italic" },
			{ token: "keyword", foreground: "a78bfa" },
			{ token: "string", foreground: "4ade80" },
			{ token: "number", foreground: "fbbf24" },
			{ token: "delimiter", foreground: "737373" },
			{ token: "type", foreground: "60a5fa" },
		],
		colors: {
			"editor.background": "#161616",
			"editor.foreground": "#fafafa",
			"editor.lineHighlightBackground": "#1c1c1d",
			"editorLineNumber.foreground": "#525252",
			"editorLineNumber.activeForeground": "#737373",
			"editor.selectionBackground": `${primary}30`,
			"editor.inactiveSelectionBackground": `${primary}15`,
			"editorCursor.foreground": "#fafafa",
			"editorWhitespace.foreground": "#2c2c2c",
			"editorIndentGuide.background": "#2c2c2c",
			"editorIndentGuide.activeBackground": "#404040",
		},
	});
}
