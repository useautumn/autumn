import { useCallback, useEffect, useRef, useState } from "react";

export const SPINE_WIDTH = 80;
export const TRACK_GAP = 12;
export const EXPAND_MS = 500;

type CardState = "active" | "departing" | "neighbor";
type CardLayout = { state: CardState; order: number };
type TransitionPhase = "idle" | "transitioning";

type Accordion = {
	trackRef: React.RefObject<HTMLDivElement | null>;
	setActiveIndex: (index: number) => void;
	revealKey: number;
	dissolveDir: number;
	isTransitioning: boolean;
	contentWidth: number;
	cardLayout: (index: number) => CardLayout;
};

export function useAccordion(count: number): Accordion {
	const trackRef = useRef<HTMLDivElement | null>(null);
	const [trackWidth, setTrackWidth] = useState(0);
	const [activeIndex, setActiveIndexState] = useState(0);
	const [departingIndex, setDepartingIndex] = useState<number | null>(null);
	const [revealKey, setRevealKey] = useState(0);
	const [dissolveDir, setDissolveDir] = useState(1);
	const [transitionPhase, setTransitionPhase] =
		useState<TransitionPhase>("idle");

	const setActiveIndex = useCallback(
		(index: number) => {
			if (
				index < 0 ||
				index >= count ||
				index === activeIndex ||
				transitionPhase !== "idle"
			) {
				return;
			}

			setDepartingIndex(activeIndex);
			setActiveIndexState(index);
			setDissolveDir(Math.sign(index - activeIndex) || 1);
			setRevealKey((key) => key + 1);
			setTransitionPhase("transitioning");
		},
		[activeIndex, count, transitionPhase],
	);

	useEffect(() => {
		if (transitionPhase !== "transitioning") return;

		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		const timer = window.setTimeout(
			() => {
				setDepartingIndex(null);
				setTransitionPhase("idle");
			},
			reduceMotion ? 0 : EXPAND_MS,
		);
		return () => window.clearTimeout(timer);
	}, [transitionPhase]);

	useEffect(() => {
		const el = trackRef.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => {
			setTrackWidth(entry.contentRect.width);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const cardLayout = (index: number): CardLayout => {
		return {
			state:
				index === activeIndex
					? "active"
					: index === departingIndex
						? "departing"
						: "neighbor",
			order: index,
		};
	};

	const neighborCount = Math.max(0, count - 1);
	const contentWidth = trackWidth
		? Math.max(0, trackWidth - neighborCount * (SPINE_WIDTH + TRACK_GAP))
		: 0;

	return {
		trackRef,
		setActiveIndex,
		revealKey,
		dissolveDir,
		isTransitioning: transitionPhase !== "idle",
		contentWidth,
		cardLayout,
	};
}
