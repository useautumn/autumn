import { useEffect, useState } from "react";

/**
 * Hook to detect user's reduced motion preference.
 * Returns true if the user prefers reduced motion.
 */
export function useReducedMotion(): boolean {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
		if (typeof window === "undefined") return false;
		return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	});

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

		const handler = (event: MediaQueryListEvent) => {
			setPrefersReducedMotion(event.matches);
		};

		mediaQuery.addEventListener("change", handler);
		return () => mediaQuery.removeEventListener("change", handler);
	}, []);

	return prefersReducedMotion;
}

/**
 * Returns animation props that respect reduced motion.
 * When reduced motion is preferred, animations are instant.
 */
export function useAnimationProps(reducedMotion: boolean) {
	if (reducedMotion) {
		return {
			initial: false,
			animate: undefined,
			exit: undefined,
			transition: { duration: 0 },
		};
	}
	return {};
}
