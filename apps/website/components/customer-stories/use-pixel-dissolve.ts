import { type RefObject, useEffect, useRef } from "react";

export const PIXEL_CELL = 4;
const SWEEP_MS = 500;
const DEFAULT_FROM = "#0A0A0A";
const DIRECTION_BIAS = 0.5;

// Strong ease-out so the reveal lands decisively up front, then the last
// pixels settle — entering elements should feel instant, not linear.
function easeOut(t: number) {
	return 1 - (1 - t) ** 3;
}

function prefersReducedMotion() {
	return (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

// Per-cell reveal threshold: random grain blended with a horizontal position
// gradient so the dissolve leans in a direction. The gradient is measured in
// track space (trackX..trackX+width over trackWidth) so several surfaces laid
// side by side form one continuous sweep rather than each restarting locally.
// direction +1 sweeps right→left, -1 left→right; bias 0 is pure noise, 1 a wipe.
function buildThresholds({
	cols,
	rows,
	seed,
	direction,
	bias,
	trackX,
	trackWidth,
}: {
	cols: number;
	rows: number;
	seed: number;
	direction: number;
	bias: number;
	trackX: number;
	trackWidth: number;
}) {
	const thresholds = new Float32Array(cols * rows);
	let state = (seed * 2654435761 + 1) >>> 0;
	const span = Math.max(trackWidth, 1);
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			state = (state * 1103515245 + 12345) & 0x7fffffff;
			const noise = state / 0x7fffffff;
			const along = (trackX + col * PIXEL_CELL) / span;
			const position = direction >= 0 ? 1 - along : along;
			thresholds[row * cols + col] = (1 - bias) * noise + bias * position;
		}
	}
	return thresholds;
}

export type PixelDissolveOptions = {
	width: number;
	height: number;
	revealKey: number;
	// Colour used by the pixel cells (defaults to the dark surface).
	fromColor?: string;
	// Optional colour for the left-hand strip that survives as the compact spine.
	retainedColor?: string;
	retainedWidth?: number;
	// "reveal" removes a solid pixel layer; "cover" builds one over the content.
	mode?: "reveal" | "cover";
	// +1 sweeps right→left, -1 left→right.
	direction?: number;
	// Decorrelates the noise pattern between surfaces sharing a revealKey.
	seed?: number;
	// Place this surface within a wider track so the directional gradient is one
	// continuous sweep across neighbouring canvases instead of restarting locally.
	trackX?: number;
	trackWidth?: number;
	onComplete?: () => void;
};

// Paints or removes square cells one by one. Reveal mode uncovers content below;
// cover mode lets an outgoing surface disappear into the supplied colour.
export function usePixelDissolve({
	width,
	height,
	revealKey,
	fromColor = DEFAULT_FROM,
	retainedColor,
	retainedWidth = 0,
	mode = "reveal",
	direction = 1,
	seed,
	trackX = 0,
	trackWidth,
	onComplete,
}: PixelDissolveOptions): RefObject<HTMLCanvasElement | null> {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const onCompleteRef = useRef(onComplete);

	useEffect(() => {
		onCompleteRef.current = onComplete;
	}, [onComplete]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !width || !height) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.ceil(width * dpr);
		canvas.height = Math.ceil(height * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const cols = Math.ceil(width / PIXEL_CELL);
		const rows = Math.ceil(height / PIXEL_CELL);
		const thresholds = buildThresholds({
			cols,
			rows,
			seed: seed ?? revealKey,
			direction,
			bias: DIRECTION_BIAS,
			trackX,
			trackWidth: trackWidth ?? width,
		});

		const paint = (progress: number) => {
			ctx.clearRect(0, 0, width, height);
			const retainedCols = retainedColor
				? Math.ceil(Math.min(retainedWidth, width) / PIXEL_CELL)
				: 0;

			const paintRange = (startCol: number, endCol: number, color: string) => {
				ctx.fillStyle = color;
				for (let row = 0; row < rows; row++) {
					for (let col = startCol; col < endCol; col++) {
						const threshold = thresholds[row * cols + col];
						const shouldPaint =
							mode === "cover" ? threshold <= progress : threshold > progress;
						if (shouldPaint) {
							ctx.fillRect(
								col * PIXEL_CELL,
								row * PIXEL_CELL,
								PIXEL_CELL,
								PIXEL_CELL,
							);
						}
					}
				}
			};

			if (retainedCols > 0 && retainedColor) {
				paintRange(0, retainedCols, retainedColor);
			}
			paintRange(retainedCols, cols, fromColor);
		};

		if (prefersReducedMotion()) {
			paint(1);
			onCompleteRef.current?.();
			return;
		}

		paint(0);
		let start = 0;
		let raf = 0;
		const frame = (now: number) => {
			if (!start) start = now;
			const progress = easeOut(Math.min((now - start) / SWEEP_MS, 1));
			paint(progress);
			if (progress < 1) {
				raf = requestAnimationFrame(frame);
			} else {
				onCompleteRef.current?.();
			}
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	}, [
		width,
		height,
		revealKey,
		fromColor,
		retainedColor,
		retainedWidth,
		mode,
		direction,
		seed,
		trackX,
		trackWidth,
	]);

	return canvasRef;
}
