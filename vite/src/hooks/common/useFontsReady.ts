import { useSyncExternalStore } from "react";

const FONT_WAIT_CAP_MS = 800;
const PAGE_FONTS = [
	"400 1em Inter",
	"500 1em Inter",
	'400 1em "JetBrains Mono"',
];

let fontsReady = !document.fonts;
const listeners = new Set<() => void>();

const settle = () => {
	if (fontsReady) return;
	fontsReady = true;
	for (const listener of listeners) listener();
};

if (!fontsReady) {
	setTimeout(settle, FONT_WAIT_CAP_MS);
	void Promise.all(PAGE_FONTS.map((font) => document.fonts.load(font)))
		.catch(() => undefined)
		.then(settle);
}

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

/**
 * Web fonts swap in with different metrics, which shifts a page that painted
 * before they arrived. Hold the first paint for them, but never for long.
 */
export const useFontsReady = () =>
	useSyncExternalStore(subscribe, () => fontsReady);
