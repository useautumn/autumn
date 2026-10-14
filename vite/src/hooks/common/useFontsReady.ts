import { useEffect, useState } from "react";

const FONT_WAIT_CAP_MS = 800;
const PAGE_FONTS = [
	"400 1em Inter",
	"500 1em Inter",
	'400 1em "JetBrains Mono"',
];

let fontsSettled = false;

/**
 * Web fonts swap in with different metrics, which shifts a page that painted
 * before they arrived. Hold the first paint for them, but never for long.
 */
export const useFontsReady = () => {
	const [ready, setReady] = useState(() => fontsSettled || !document.fonts);

	useEffect(() => {
		if (ready) return;
		const settle = () => {
			fontsSettled = true;
			setReady(true);
		};
		const timer = setTimeout(settle, FONT_WAIT_CAP_MS);
		void Promise.all(PAGE_FONTS.map((font) => document.fonts.load(font)))
			.catch(() => undefined)
			.then(settle);
		return () => clearTimeout(timer);
	}, [ready]);

	return ready;
};
