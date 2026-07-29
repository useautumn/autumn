import { useEffect, useRef, useState } from "react";

export const SPINE_WIDTH = 80;
export const TRACK_GAP = 12;

type CardState = "active" | "neighbor" | "hidden";
type CardLayout = { state: CardState; order: number };

type Accordion = {
	trackRef: React.RefObject<HTMLDivElement | null>;
	prevActiveIndex: number;
	setActiveIndex: (index: number) => void;
	revealKey: number;
	dissolveDir: number;
	contentWidth: number;
	cardLayout: (index: number) => CardLayout;
};

// Signed nearest-direction offset on a ring, e.g. for count 4 the card before
// the active one is -1 even when it wraps from the end of the list.
function ringOffset(index: number, active: number, count: number) {
	const forward = (index - active + count) % count;
	return forward > count / 2 ? forward - count : forward;
}

export function useAccordion(count: number): Accordion {
	const trackRef = useRef<HTMLDivElement | null>(null);
	const [trackWidth, setTrackWidth] = useState(0);
	const [activeIndex, setActiveIndexState] = useState(0);
	const [prevActiveIndex, setPrevActiveIndex] = useState(0);
	const [revealKey, setRevealKey] = useState(0);
	const [dissolveDir, setDissolveDir] = useState(1);

	const setActiveIndex = (index: number) => {
		setActiveIndexState((current) => {
			if (current !== index) {
				setPrevActiveIndex(current);
				setRevealKey((k) => k + 1);
				// Sweep from the side the new slide was clicked on: +1 reveals
				// right→left (clicked the right spine), -1 reveals left→right.
				setDissolveDir(Math.sign(ringOffset(index, current, count)) || 1);
			}
			return index;
		});
	};

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
		const offset = ringOffset(index, activeIndex, count);
		const distance = Math.abs(offset);
		const state: CardState =
			distance === 0 ? "active" : distance === 1 ? "neighbor" : "hidden";
		return { state, order: offset };
	};

	// With wrap, the active card always has two circular neighbors.
	const neighborCount = count >= 3 ? 2 : count - 1;
	const contentWidth = trackWidth
		? trackWidth - neighborCount * (SPINE_WIDTH + TRACK_GAP)
		: 0;

	return {
		trackRef,
		prevActiveIndex,
		setActiveIndex,
		revealKey,
		dissolveDir,
		contentWidth,
		cardLayout,
	};
}
