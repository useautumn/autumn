import { useLayoutEffect } from "react";

export const useStableScrollbar = () => {
	useLayoutEffect(() => {
		const container = document.querySelector<HTMLElement>(
			"[data-main-content]",
		);
		if (!container) return;

		const previous = container.style.scrollbarGutter;
		container.style.scrollbarGutter = "stable";

		return () => {
			container.style.scrollbarGutter = previous;
		};
	}, []);
};
