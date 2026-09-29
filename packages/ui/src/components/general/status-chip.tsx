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
	clock: "M8 4.8a3.2 3.2 0 1 1 0 6.4a3.2 3.2 0 1 1 0-6.4M8 6.7V8l1.5 1",
	alert: "M8 4.6v4.2M8 11.2v.1",
	minus: "M5.2 8h5.6",
	x: "M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6",
	ban: "M5.4 10.6l5.2-5.2",
	pause: "M6.4 5.3v5.4M9.6 5.3v5.4",
	play: "M6.5 5.2v5.6L10.7 8z",
	calendar: "M5 5.6h6v5H5zM5 7.6h6",
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
	coins:
		"M184,89.57V84c0-25.08-37.83-44-88-44S8,58.92,8,84v40c0,20.89,26.25,37.49,64,42.46V172c0,25.08,37.83,44,88,44s88-18.92,88-44V132C248,111.3,222.58,94.68,184,89.57ZM56,146.87C36.41,141.4,24,132.39,24,124V109.93c8.16,5.78,19.09,10.44,32,13.57Zm80-23.37c12.91-3.13,23.84-7.79,32-13.57V124c0,8.39-12.41,17.4-32,22.87Zm-16,71.37C100.41,189.4,88,180.39,88,172v-4.17c2.63.1,5.29.17,8,.17,3.88,0,7.67-.13,11.39-.35A121.92,121.92,0,0,0,120,171.41Zm0-44.62A163,163,0,0,1,96,152a163,163,0,0,1-24-1.75V126.46A183.74,183.74,0,0,0,96,128a183.74,183.74,0,0,0,24-1.54Zm64,48a165.45,165.45,0,0,1-48,0V174.4a179.48,179.48,0,0,0,24,1.6,183.74,183.74,0,0,0,24-1.54ZM232,172c0,8.39-12.41,17.4-32,22.87V171.5c12.91-3.13,23.84-7.79,32-13.57Z",
	cpu: "M104,104h48v48H104Zm136,48a8,8,0,0,1-8,8H216v40a16,16,0,0,1-16,16H160v16a8,8,0,0,1-16,0V216H112v16a8,8,0,0,1-16,0V216H56a16,16,0,0,1-16-16V160H24a8,8,0,0,1,0-16H40V112H24a8,8,0,0,1,0-16H40V56A16,16,0,0,1,56,40H96V24a8,8,0,0,1,16,0V40h32V24a8,8,0,0,1,16,0V40h40a16,16,0,0,1,16,16V96h16a8,8,0,0,1,0,16H216v32h16A8,8,0,0,1,240,152ZM168,96a8,8,0,0,0-8-8H96a8,8,0,0,0-8,8v64a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8Z",
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
