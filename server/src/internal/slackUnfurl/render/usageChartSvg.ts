import type { UsagePoint } from "../data/types.js";
import { theme } from "./theme.js";

/**
 * Build a compact area/line chart as an inline SVG data URI. takumi rasterises
 * SVG images, so this gives a real smooth area chart (line + gradient fill)
 * rather than chunky bars.
 */
export function usageChartSvgDataUri(
	points: UsagePoint[],
	{ width = 1000, height = 90 }: { width?: number; height?: number } = {},
): string {
	const values = points.map((point) => point.value);
	const max = Math.max(...values, 1);
	const top = 6;
	const bottom = height - 4;
	const usableHeight = bottom - top;

	const coords = points.map((point, index) => {
		const x =
			points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
		const y = bottom - (point.value / max) * usableHeight;
		return { x: round(x), y: round(y) };
	});

	const line = coords.map(({ x, y }) => `${x},${y}`).join(" ");
	const area = `${coords[0].x},${bottom} ${line} ${coords[coords.length - 1].x},${bottom}`;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${theme.purple}" stop-opacity="0.28"/>
<stop offset="1" stop-color="${theme.purple}" stop-opacity="0"/>
</linearGradient></defs>
<polygon points="${area}" fill="url(#g)"/>
<polyline points="${line}" fill="none" stroke="${theme.purple}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const round = (value: number): number => Math.round(value * 10) / 10;
