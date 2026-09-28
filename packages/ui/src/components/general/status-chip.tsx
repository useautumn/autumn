import { cn } from "@autumn/ui/lib/utils";
import type { ComponentProps } from "react";

const STATUS_TONES = {
	green: "text-[#30A46C] [--glyph:#0E1C15]",
	blue: "text-[#3E8BD9] [--glyph:#0C1726]",
	red: "text-[#E5484D] [--glyph:#2A0C0D]",
	orange: "text-[#E8742C] [--glyph:#2A1405]",
	amber: "text-[#E5A21F] [--glyph:#2A1C05]",
	yellow: "text-[#E2B93B] [--glyph:#261F06]",
	purple: "text-[#9A6BFF] [--glyph:#1A0F33]",
	pink: "text-[#D6409F] [--glyph:#2A0C1E]",
	fuchsia: "text-[#C050D8] [--glyph:#240C2A]",
	neutral: "text-[#8A8A8A] [--glyph:#161616]",
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
	calendar: "M5 5.6h6v5H5zM5 7.6h6",
	hourglass: "M5.6 4.8h4.8M5.6 11.2h4.8M6.2 4.8l3.6 6.4M9.8 4.8l-3.6 6.4",
	pencil: "M5 11l.5-2 4-4 1.5 1.5-4 4z",
	refresh: "M5 8a3 3 0 1 0 1-2.2M5 4.6v1.8h1.8",
	spinner: CIRCLE,
	toggle: "M6 5.8h4a2.2 2.2 0 0 1 0 4.4H6a2.2 2.2 0 0 1 0-4.4zM10 8h.01",
	battery: "M4.2 6h6.6v4H4.2zM11.8 7.3v1.4",
	ticket: "M4.4 5.6h7.2v1.5a.9.9 0 0 0 0 1.8v1.5H4.4V8.9a.9.9 0 0 0 0-1.8z",
	coins:
		"M5 6.3c0-.7 1.3-1.3 3-1.3s3 .6 3 1.3-1.3 1.3-3 1.3-3-.6-3-1.3zM5 6.3v3.4c0 .7 1.3 1.3 3 1.3s3-.6 3-1.3V6.3",
	cpu: "M5.4 5.4h5.2v5.2H5.4zM7.2 7.2h1.6v1.6H7.2z",
	terminal: "M5.2 6l2 2-2 2M8.6 10.2h2.2",
	shield: "M8 4.6l3 1.1v2.2c0 1.9-1.3 3.1-3 3.6-1.7-.5-3-1.7-3-3.6V5.7z",
	user: "M8 7.8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5.3 11.2c.4-1.4 1.4-2.2 2.7-2.2s2.3.8 2.7 2.2",
	dashed: CIRCLE,
};

const GLYPH_DASHES: Partial<Record<keyof typeof STATUS_GLYPHS, string>> = {
	spinner: "12 8",
	dashed: "1.6 1.4",
};

export type StatusTone = keyof typeof STATUS_TONES;
export type StatusGlyph = keyof typeof STATUS_GLYPHS;

export function StatusChipIcon({
	tone,
	glyph,
	className,
}: {
	tone: StatusTone;
	glyph: StatusGlyph;
	className?: string;
}) {
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
				"inline-flex h-[22px] min-w-0 max-w-full shrink-0 items-center gap-1.5 rounded-md border border-black/6 bg-black/4 pr-[7px] pl-1 text-xs leading-4 font-medium tracking-[-0.005em] whitespace-nowrap text-foreground dark:border-white/6 dark:bg-white/4",
				!glyph && "pl-[7px]",
				dashed && "border-dashed border-black/15 dark:border-white/15",
				className,
			)}
			{...props}
		>
			{glyph && <StatusChipIcon tone={tone ?? "neutral"} glyph={glyph} />}
			{children}
		</span>
	);
}
