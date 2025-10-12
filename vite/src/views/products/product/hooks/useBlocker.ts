import { useEffect, useRef } from "react";

/**
 * Custom navigation blocker for SPAs using BrowserRouter
 * Works with React Router v7 without requiring a data router
 */
export function useBlocker({
	shouldBlock,
	confirmFn,
}: {
	shouldBlock: boolean;
	confirmFn: () => boolean;
}) {
	const isNavigatingRef = useRef(false);

	// Intercept programmatic navigation (navigate calls)
	useEffect(() => {
		if (!shouldBlock) return;

		const originalPushState = window.history.pushState;
		const originalReplaceState = window.history.replaceState;

		// Intercept pushState
		window.history.pushState = (
			state: unknown,
			title: string,
			url?: string | URL | null,
		) => {
			const targetUrl = url?.toString() || window.location.href;

			if (!isNavigatingRef.current && targetUrl !== window.location.href) {
				const confirmed = confirmFn();
				if (confirmed) {
					isNavigatingRef.current = true;
					originalPushState.call(window.history, state, title, url);
					// Reset flag after navigation completes
					setTimeout(() => {
						isNavigatingRef.current = false;
					}, 0);
				}
			} else {
				originalPushState.call(window.history, state, title, url);
			}
		};

		// Intercept replaceState
		window.history.replaceState = (
			state: unknown,
			title: string,
			url?: string | URL | null,
		) => {
			const targetUrl = url?.toString() || window.location.href;

			if (!isNavigatingRef.current && targetUrl !== window.location.href) {
				const confirmed = confirmFn();
				if (confirmed) {
					isNavigatingRef.current = true;
					originalReplaceState.call(window.history, state, title, url);
					setTimeout(() => {
						isNavigatingRef.current = false;
					}, 0);
				}
			} else {
				originalReplaceState.call(window.history, state, title, url);
			}
		};

		return () => {
			window.history.pushState = originalPushState;
			window.history.replaceState = originalReplaceState;
		};
	}, [shouldBlock, confirmFn]);

	// Handle browser back/forward buttons
	useEffect(() => {
		if (!shouldBlock) return;

		const handlePopState = () => {
			if (isNavigatingRef.current) return;

			const confirmed = confirmFn();
			if (!confirmed) {
				// Block navigation by pushing current location back
				window.history.pushState(null, "", window.location.href);
			} else {
				isNavigatingRef.current = true;
				setTimeout(() => {
					isNavigatingRef.current = false;
				}, 0);
			}
		};

		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [shouldBlock, confirmFn]);

	// Handle anchor link clicks
	useEffect(() => {
		if (!shouldBlock) return;

		const handleClick = (e: MouseEvent) => {
			if (isNavigatingRef.current) return;

			const target = (e.target as HTMLElement).closest("a");
			if (
				target?.href &&
				target.origin === window.location.origin &&
				!target.target &&
				!target.hasAttribute("download")
			) {
				const targetUrl = target.href;
				if (targetUrl !== window.location.href) {
					e.preventDefault();
					const confirmed = confirmFn();
					if (confirmed) {
						isNavigatingRef.current = true;
						window.location.href = targetUrl;
					}
				}
			}
		};

		document.addEventListener("click", handleClick, true);
		return () => document.removeEventListener("click", handleClick, true);
	}, [shouldBlock, confirmFn]);
}
