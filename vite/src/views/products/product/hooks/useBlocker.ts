import { useEffect, useRef } from "react";

const DEFAULT_MESSAGE =
	"Are you sure you want to leave without updating the product? Click cancel to stay and save your changes, or click OK to leave without saving.";

export function useBlocker(
	shouldBlock: boolean,
	confirmFn: () => Promise<boolean> | boolean = () =>
		window.confirm(DEFAULT_MESSAGE),
) {
	const isNavigatingRef = useRef(false);
	const originalPushState = useRef<typeof history.pushState | null>(null);
	const originalReplaceState = useRef<typeof history.replaceState | null>(null);

	// Reset navigation flag when shouldBlock changes
	useEffect(() => {
		if (!shouldBlock) {
			isNavigatingRef.current = false;
		}
	}, [shouldBlock]);

	// ✅ Handle beforeunload for tab/window close
	useEffect(() => {
		if (!shouldBlock) return;

		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			// Don't show native dialog if we're already navigating
			if (isNavigatingRef.current) return;

			e.preventDefault();
			const message = DEFAULT_MESSAGE;
			e.returnValue = message; // For older browsers
			return message;
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [shouldBlock]);

	// ✅ Intercept React Router navigation (history.pushState/replaceState)
	useEffect(() => {
		if (!shouldBlock) return;

		// Store original methods
		originalPushState.current = history.pushState;
		originalReplaceState.current = history.replaceState;

		// Intercept pushState (used by React Router navigate)
		history.pushState = async (
			state: any,
			title: string,
			url?: string | URL | null,
		) => {
			if (
				!isNavigatingRef.current &&
				url &&
				url.toString() !== window.location.href
			) {
				const confirmed = await confirmFn();
				if (confirmed) {
					isNavigatingRef.current = true;
					originalPushState.current!.call(history, state, title, url);
					setTimeout(() => {
						isNavigatingRef.current = false;
					}, 100);
				}
			} else {
				originalPushState.current!.call(history, state, title, url);
			}
		};

		// Intercept replaceState
		history.replaceState = async (
			state: any,
			title: string,
			url?: string | URL | null,
		) => {
			if (
				!isNavigatingRef.current &&
				url &&
				url.toString() !== window.location.href
			) {
				const confirmed = await confirmFn();
				if (confirmed) {
					isNavigatingRef.current = true;
					originalReplaceState.current!.call(history, state, title, url);
					setTimeout(() => {
						isNavigatingRef.current = false;
					}, 100);
				}
			} else {
				originalReplaceState.current!.call(history, state, title, url);
			}
		};

		return () => {
			// Restore original methods on cleanup
			if (originalPushState.current) {
				history.pushState = originalPushState.current;
			}
			if (originalReplaceState.current) {
				history.replaceState = originalReplaceState.current;
			}
		};
	}, [shouldBlock, confirmFn]);

	// ✅ Handle anchor <a> clicks inside the app
	useEffect(() => {
		const handleClick = async (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const anchor = target.closest("a") as HTMLAnchorElement | null;

			if (
				shouldBlock &&
				!isNavigatingRef.current &&
				anchor &&
				anchor.href &&
				!anchor.target &&
				!anchor.hasAttribute("download") &&
				anchor.origin === window.location.origin
			) {
				e.preventDefault();
				const confirmed = await confirmFn();
				if (confirmed) {
					isNavigatingRef.current = true;
					window.location.href = anchor.href;
				}
			}
		};

		document.addEventListener("click", handleClick, true);
		return () => document.removeEventListener("click", handleClick, true);
	}, [shouldBlock, confirmFn]);

	// ✅ Handle back/forward browser buttons
	useEffect(() => {
		if (!shouldBlock) return;

		const handlePopState = async () => {
			if (isNavigatingRef.current) return;

			const confirmed = await confirmFn();
			if (!confirmed) {
				// Push current state again to block history pop
				history.pushState(null, "", window.location.href);
			} else {
				isNavigatingRef.current = true;
				// Navigate back after confirmation
				history.back();
			}
		};

		// Push current page to history stack to detect backward
		history.pushState(null, "", window.location.href);
		window.addEventListener("popstate", handlePopState);

		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	}, [shouldBlock, confirmFn]);
}
