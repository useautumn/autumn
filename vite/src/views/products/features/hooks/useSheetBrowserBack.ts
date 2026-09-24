import { useHotkeys } from "react-hotkeys-hook";

/** Cmd+← is browser back on Mac, but a focused input treats it as
 * beginning-of-line. Restore back while the sheet is open. */
export function useSheetBrowserBack({ enabled }: { enabled: boolean }) {
	useHotkeys(
		"meta+left",
		() => {
			window.history.back();
		},
		{ enableOnFormTags: true, preventDefault: true, enabled },
	);
}
