import { useEffect, useRef } from "react";

const LOOP_DURATION = 22000;

export function useEvalConversationLoop() {
	const ref = useRef<HTMLElement>(null);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		let visible = false;
		let animations: Animation[] = [];

		const syncPlayback = () => {
			for (const animation of animations) {
				if (visible && !document.hidden) animation.play();
				else animation.pause();
			}
		};

		const createLoop = () => {
			for (const animation of animations) animation.cancel();
			animations = [];
			if (reducedMotion.matches) return;

			for (const turn of element.querySelectorAll<HTMLElement>(
				"[data-turn-at]",
			)) {
				const start = Number(turn.dataset.turnAt);
				const animation = turn.animate(
					[
						{ opacity: 0, offset: 0, easing: "steps(1, end)" },
						{
							opacity: 1,
							offset: start / LOOP_DURATION,
							easing: "steps(1, end)",
						},
						{ opacity: 0, offset: 1 },
					],
					{ duration: LOOP_DURATION, iterations: Infinity, fill: "both" },
				);
				animations.push(animation);
			}
			syncPlayback();
		};

		const observer = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
				syncPlayback();
			},
			{ threshold: 0.2 },
		);

		createLoop();
		observer.observe(element);
		document.addEventListener("visibilitychange", syncPlayback);
		reducedMotion.addEventListener("change", createLoop);

		return () => {
			observer.disconnect();
			for (const animation of animations) animation.cancel();
			document.removeEventListener("visibilitychange", syncPlayback);
			reducedMotion.removeEventListener("change", createLoop);
		};
	}, []);

	return ref;
}
