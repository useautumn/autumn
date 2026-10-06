import { cn } from "@autumn/ui/lib/utils";
import { type ComponentProps, useId } from "react";

/** Light glyphs on the fill in light mode; dark glyphs in dark mode and on light fills. */
const STATUS_TONES = {
	green: "text-[#30A46C] [--glyph:#fff] dark:[--glyph:#0E1C15]",
	blue: "text-[#3E8BD9] [--glyph:#fff] dark:[--glyph:#0C1726]",
	red: "text-[#E5484D] [--glyph:#fff] dark:[--glyph:#2A0C0D]",
	orange: "text-[#E8742C] [--glyph:#fff] dark:[--glyph:#2A1405]",
	amber: "text-[#E5A21F] [--glyph:#2A1C05]",
	yellow: "text-[#E2B93B] [--glyph:#261F06]",
	purple: "text-[#9A6BFF] [--glyph:#fff] dark:[--glyph:#1A0F33]",
	pink: "text-[#D6409F] [--glyph:#fff] dark:[--glyph:#2A0C1E]",
	fuchsia: "text-[#C050D8] [--glyph:#fff] dark:[--glyph:#240C2A]",
	neutral: "text-[#8A8A8A] [--glyph:#fff] dark:[--glyph:#161616]",
};

const CIRCLE = "M8 4.8a3.2 3.2 0 1 1 0 6.4a3.2 3.2 0 1 1 0-6.4";

/** 16×16 viewBox stroke paths drawn inside the rounded status square. */
const STATUS_GLYPHS = {
	check: "M4.8 8.2l2.1 2.1 4.3-4.4",
	clock: "M8 4.8V8l2.1 1.4",
	alert: "M8 4.6v4.2M8 11.2v.1",
	minus: "M5.2 8h5.6",
	x: "M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6",
	ban: "M5.4 10.6l5.2-5.2",
	pause: "M6.4 5.3v5.4M9.6 5.3v5.4",
	play: "M6.5 5.2v5.6L10.7 8z",
	hourglass: "M5.6 4.8h4.8M5.6 11.2h4.8M6.2 4.8l3.6 6.4M9.8 4.8l-3.6 6.4",
	pencil: "M5 11l.5-2 4-4 1.5 1.5-4 4z",
	refresh: "M5 8a3 3 0 1 0 1-2.2M5 4.6v1.8h1.8",
	spinner: CIRCLE,
	terminal: "M5.2 6l2 2-2 2M8.6 10.2h2.2",
	shield: "M8 4.6l3 1.1v2.2c0 1.9-1.3 3.1-3 3.6-1.7-.5-3-1.7-3-3.6V5.7z",
	user: "M8 7.8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5.3 11.2c.4-1.4 1.4-2.2 2.7-2.2s2.3.8 2.7 2.2",
	dashed: CIRCLE,
};

const ICON_GLYPH_SCALE = 11 / 256;

/** Phosphor fill icons (256×256) knocked out of a solid tile; stroke glyphs blur at this size. */
const ICON_GLYPHS = {
	toggle:
		"M176,56H80a72,72,0,0,0,0,144h96a72,72,0,0,0,0-144Zm0,112a40,40,0,1,1,40-40A40,40,0,0,1,176,168Z",
	battery:
		"M152,96v64a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8h96A8,8,0,0,1,152,96Zm72-16v96a24,24,0,0,1-24,24H32A24,24,0,0,1,8,176V80A24,24,0,0,1,32,56H200A24,24,0,0,1,224,80Zm-16,0a8,8,0,0,0-8-8H32a8,8,0,0,0-8,8v96a8,8,0,0,0,8,8H200a8,8,0,0,0,8-8Zm40,8a8,8,0,0,0-8,8v64a8,8,0,0,0,16,0V96A8,8,0,0,0,248,88Z",
	ticket:
		"M232,104a8,8,0,0,0,8-8V64a16,16,0,0,0-16-16H32A16,16,0,0,0,16,64V96a8,8,0,0,0,8,8,24,24,0,0,1,0,48,8,8,0,0,0-8,8v32a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V160a8,8,0,0,0-8-8,24,24,0,0,1,0-48ZM32,167.2a40,40,0,0,0,0-78.4V64H88V192H32Z",
	calendar:
		"M48 72h160v40H48zM48 112h24v96H48zM184 112h24v96h-24zM48 184h160v24H48zM72 32h24v48H72zM160 32h24v48h-24z",
	coins:
		"M184,89.57V84c0-25.08-37.83-44-88-44S8,58.92,8,84v40c0,20.89,26.25,37.49,64,42.46V172c0,25.08,37.83,44,88,44s88-18.92,88-44V132C248,111.3,222.58,94.68,184,89.57ZM56,146.87C36.41,141.4,24,132.39,24,124V109.93c8.16,5.78,19.09,10.44,32,13.57Zm80-23.37c12.91-3.13,23.84-7.79,32-13.57V124c0,8.39-12.41,17.4-32,22.87Zm-16,71.37C100.41,189.4,88,180.39,88,172v-4.17c2.63.1,5.29.17,8,.17,3.88,0,7.67-.13,11.39-.35A121.92,121.92,0,0,0,120,171.41Zm0-44.62A163,163,0,0,1,96,152a163,163,0,0,1-24-1.75V126.46A183.74,183.74,0,0,0,96,128a183.74,183.74,0,0,0,24-1.54Zm64,48a165.45,165.45,0,0,1-48,0V174.4a179.48,179.48,0,0,0,24,1.6,183.74,183.74,0,0,0,24-1.54ZM232,172c0,8.39-12.41,17.4-32,22.87V171.5c12.91-3.13,23.84-7.79,32-13.57Z",
	tag: "M243.31,136,144,36.69A15.86,15.86,0,0,0,132.69,32H40a8,8,0,0,0-8,8v92.69A15.86,15.86,0,0,0,36.69,144L136,243.31a16,16,0,0,0,22.63,0l84.68-84.68a16,16,0,0,0,0-22.63ZM84,96A12,12,0,1,1,96,84,12,12,0,0,1,84,96Z",
	cpu: "M104,104h48v48H104Zm136,48a8,8,0,0,1-8,8H216v40a16,16,0,0,1-16,16H160v16a8,8,0,0,1-16,0V216H112v16a8,8,0,0,1-16,0V216H56a16,16,0,0,1-16-16V160H24a8,8,0,0,1,0-16H40V112H24a8,8,0,0,1,0-16H40V56A16,16,0,0,1,56,40H96V24a8,8,0,0,1,16,0V40h32V24a8,8,0,0,1,16,0V40h40a16,16,0,0,1,16,16V96h16a8,8,0,0,1,0,16H216v32h16A8,8,0,0,1,240,152ZM168,96a8,8,0,0,0-8-8H96a8,8,0,0,0-8,8v64a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8Z",
	currencyCircleDollar:
		"M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm12,152h-4v8a8,8,0,0,1-16,0v-8H104a8,8,0,0,1,0-16h36a12,12,0,0,0,0-24H116a28,28,0,0,1,0-56h4V72a8,8,0,0,1,16,0v8h16a8,8,0,0,1,0,16H116a12,12,0,0,0,0,24h24a28,28,0,0,1,0,56Z",
	currencyDollar:
		"M160,152a16,16,0,0,1-16,16h-8V136h8A16,16,0,0,1,160,152Zm72-24A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-56,24a32,32,0,0,0-32-32h-8V88h4a16,16,0,0,1,16,16,8,8,0,0,0,16,0,32,32,0,0,0-32-32h-4V64a8,8,0,0,0-16,0v8h-4a32,32,0,0,0,0,64h4v32h-8a16,16,0,0,1-16-16,8,8,0,0,0-16,0,32,32,0,0,0,32,32h8v8a8,8,0,0,0,16,0v-8h8A32,32,0,0,0,176,152Zm-76-48a16,16,0,0,0,16,16h4V88h-4A16,16,0,0,0,100,104Z",
	arrowsClockwise:
		"M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1-5.66-13.66L180.65,72a79.48,79.48,0,0,0-54.72-22.09h-.45A79.52,79.52,0,0,0,69.59,72.71,8,8,0,0,1,58.41,61.27,96,96,0,0,1,192,60.7l18.36-18.36A8,8,0,0,1,224,48ZM186.41,183.29A80,80,0,0,1,75.35,184l18.31-18.31A8,8,0,0,0,88,152H40a8,8,0,0,0-8,8v48a8,8,0,0,0,13.66,5.66L64,195.3a95.42,95.42,0,0,0,66,26.76h.53a95.36,95.36,0,0,0,67.07-27.33,8,8,0,0,0-11.18-11.44Z",
	wrench:
		"M232,96a72,72,0,0,1-100.94,66L79,222.22c-.12.14-.26.29-.39.42a32,32,0,0,1-45.26-45.26c.14-.13.28-.27.43-.39L94,124.94a72.07,72.07,0,0,1,83.54-98.78,8,8,0,0,1,3.93,13.19L144,80l5.66,26.35L176,112l40.65-37.52a8,8,0,0,1,13.19,3.93A72.6,72.6,0,0,1,232,96Z",
	person:
		"M230.93,220a8,8,0,0,1-6.93,4H32a8,8,0,0,1-6.92-12c15.23-26.33,38.7-45.21,66.09-54.16a72,72,0,1,1,73.66,0c27.39,8.95,50.86,27.83,66.09,54.16A8,8,0,0,1,230.93,220Z",
	userMinus:
		"M198.13,194.85A8,8,0,0,1,192,208H24a8,8,0,0,1-6.12-13.15c14.94-17.78,33.52-30.41,54.17-37.17a68,68,0,1,1,71.9,0C164.6,164.44,183.18,177.07,198.13,194.85ZM248,128H200a8,8,0,0,0,0,16h48a8,8,0,0,0,0-16Z",
	prohibit:
		"M200,128a71.69,71.69,0,0,1-15.78,44.91L83.09,71.78A71.95,71.95,0,0,1,200,128ZM56,128a71.95,71.95,0,0,0,116.91,56.22L71.78,83.09A71.69,71.69,0,0,0,56,128Zm180,0A108,108,0,1,1,128,20,108.12,108.12,0,0,1,236,128Zm-20,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z",
	plusCircle:
		"M128,24A104,104,0,1,0,232,128,104.13,104.13,0,0,0,128,24Zm40,112H136v32a8,8,0,0,1-16,0V136H88a8,8,0,0,1,0-16h32V88a8,8,0,0,1,16,0v32h32a8,8,0,0,1,0,16Z",
	gitBranch:
		"M232,64a32,32,0,1,0-40,31v17a8,8,0,0,1-8,8H96a23.84,23.84,0,0,0-8,1.38V95a32,32,0,1,0-16,0v66a32,32,0,1,0,16,0V144a8,8,0,0,1,8-8h88a24,24,0,0,0,24-24V95A32.06,32.06,0,0,0,232,64ZM64,64A16,16,0,1,1,80,80,16,16,0,0,1,64,64ZM96,192a16,16,0,1,1-16-16A16,16,0,0,1,96,192Z",
};

const isIconGlyph = (glyph: StatusGlyph): glyph is keyof typeof ICON_GLYPHS =>
	glyph in ICON_GLYPHS;

const GLYPH_DASHES: Partial<Record<keyof typeof STATUS_GLYPHS, string>> = {
	spinner: "12 8",
	dashed: "1.6 1.4",
};

export type StatusTone = keyof typeof STATUS_TONES;
export type StatusGlyph = keyof typeof STATUS_GLYPHS | keyof typeof ICON_GLYPHS;

/** The glyph is masked out of the tile, so the chip background shows through it. */
function IconGlyphTile({
	tone,
	glyph,
	className,
}: {
	tone: StatusTone;
	glyph: keyof typeof ICON_GLYPHS;
	className?: string;
}) {
	const maskId = `glyph-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 16 16"
			className={cn("shrink-0", STATUS_TONES[tone], className)}
		>
			<mask id={maskId}>
				<rect width="16" height="16" fill="white" />
				<path
					d={ICON_GLYPHS[glyph]}
					fill="black"
					transform={`translate(2.5 2.5) scale(${ICON_GLYPH_SCALE})`}
				/>
			</mask>
			<rect
				width="16"
				height="16"
				rx="4.5"
				fill="currentColor"
				mask={`url(#${maskId})`}
			/>
		</svg>
	);
}

export function StatusChipIcon({
	tone,
	glyph,
	className,
}: {
	tone: StatusTone;
	glyph: StatusGlyph;
	className?: string;
}) {
	if (isIconGlyph(glyph)) {
		return <IconGlyphTile tone={tone} glyph={glyph} className={className} />;
	}

	return (
		<svg
			aria-hidden="true"
			width="14"
			height="14"
			viewBox="0 0 16 16"
			className={cn("shrink-0", STATUS_TONES[tone], className)}
		>
			<rect x="1" y="1" width="14" height="14" rx="3.5" fill="currentColor" />
			<path
				d={STATUS_GLYPHS[glyph]}
				fill="none"
				stroke="var(--glyph)"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeDasharray={GLYPH_DASHES[glyph]}
				className={cn(
					glyph === "spinner" &&
						"origin-center animate-spin [transform-box:fill-box]",
				)}
			/>
		</svg>
	);
}

const RING_RADIUS = 6;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Progress ring sized to replace the status square; `fraction` runs 0 to 1. */
export function StatusRing({
	tone,
	fraction,
	className,
}: {
	tone: StatusTone;
	fraction: number;
	className?: string;
}) {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 16 16"
			className={cn("shrink-0", STATUS_TONES[tone], className)}
		>
			<circle
				cx="8"
				cy="8"
				r={RING_RADIUS}
				fill="none"
				strokeWidth="2.5"
				className="stroke-black/10 dark:stroke-[#2a2a2a]"
			/>
			<circle
				cx="8"
				cy="8"
				r={RING_RADIUS}
				fill="none"
				stroke="currentColor"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeDasharray={`${(RING_CIRCUMFERENCE * fraction).toFixed(1)} ${RING_CIRCUMFERENCE.toFixed(1)}`}
				transform="rotate(-90 8 8)"
			/>
		</svg>
	);
}

/** Neutral chip: only the status square carries colour, never the label. */
export function StatusChip({
	tone,
	glyph,
	dashed = false,
	className,
	children,
	...props
}: ComponentProps<"span"> & {
	tone?: StatusTone;
	glyph?: StatusGlyph;
	dashed?: boolean;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-[22px] min-w-0 max-w-full items-center gap-1.5 rounded-md border border-black/6 bg-black/4 pr-[7px] pl-1 text-xs leading-4 font-medium tracking-[-0.005em] whitespace-nowrap text-foreground dark:border-white/6 dark:bg-white/4",
				!glyph && "pl-[7px]",
				glyph && isIconGlyph(glyph) && "pl-[3px]",
				dashed && "border-dashed border-black/15 dark:border-white/15",
				className,
			)}
			title={typeof children === "string" ? children : undefined}
			{...props}
		>
			{glyph && <StatusChipIcon tone={tone ?? "neutral"} glyph={glyph} />}
			{typeof children === "string" ? (
				<span className="min-w-0 truncate">{children}</span>
			) : (
				children
			)}
		</span>
	);
}
