import { HoverCard, HoverCardContent, HoverCardTrigger } from "@autumn/ui";
import { useLayoutEffect, useRef, useState } from "react";

export type ChartLegendEntry = {
	key: string;
	label: string;
	color: string | undefined;
	value: number;
	title: string;
};

/**
 * Horizontal chart legend that hides tail entries when they would overflow the
 * available width. Renders a `+N more` pill summarizing hidden entries (with
 * a tooltip listing each collapsed label and value).
 *
 * Measurement strategy: render all entries off-screen, measure their widths,
 * then choose the largest prefix that fits alongside the overflow pill.
 */
export function ChartLegend({
	entries,
	showLabels: explicitShowLabels,
}: {
	entries: ChartLegendEntry[];
	/** Override label visibility. Defaults to true when ≤3 entries. */
	showLabels?: boolean;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const measureRef = useRef<HTMLDivElement>(null);
	const [visibleCount, setVisibleCount] = useState(entries.length);

	const showLabels =
		explicitShowLabels !== undefined ? explicitShowLabels : entries.length <= 3;

	// Recompute whenever entries, container width, or label mode changes.
	useLayoutEffect(() => {
		const container = containerRef.current;
		const measure = measureRef.current;
		if (!container || !measure) return;

		const recompute = () => {
			const containerWidth = container.clientWidth;
			if (!containerWidth) return;

			const children = Array.from(measure.children) as HTMLElement[];
			// Last child is the overflow pill template; rest are entries.
			const overflowEl = children[children.length - 1];
			const entryEls = children.slice(0, -1);
			const GAP = 16; // matches gap-4 = 1rem = 16px
			const overflowWidth = overflowEl
				? overflowEl.getBoundingClientRect().width
				: 0;

			// Try fitting all entries with no overflow pill first.
			let total = 0;
			for (let i = 0; i < entryEls.length; i++) {
				const w = entryEls[i].getBoundingClientRect().width;
				total += w + (i > 0 ? GAP : 0);
				if (total > containerWidth) {
					// Doesn't fit — find the largest prefix that fits WITH the
					// overflow pill appended (which itself takes width + gap).
					let fitted = 0;
					let running = overflowWidth;
					for (let j = 0; j < entryEls.length; j++) {
						const next =
							running +
							(j > 0 || fitted > 0 ? GAP : 0) +
							entryEls[j].getBoundingClientRect().width;
						if (next <= containerWidth) {
							running = next;
							fitted = j + 1;
						} else {
							break;
						}
					}
					setVisibleCount(fitted);
					return;
				}
			}
			setVisibleCount(entryEls.length);
		};

		recompute();

		const ro = new ResizeObserver(recompute);
		ro.observe(container);
		return () => ro.disconnect();
	}, [entries, showLabels]);

	if (entries.length === 0) return null;

	const visible = entries.slice(0, visibleCount);
	const overflow = entries.slice(visibleCount);
	const overflowTotal = overflow.reduce((acc, e) => acc + e.value, 0);

	return (
		<div
			ref={containerRef}
			className="relative h-7 shrink-0 border-b bg-card overflow-hidden"
		>
			{/* Off-screen measurement layer: renders every entry + the overflow
			    pill template at natural width so we can read their sizes. */}
			<div
				ref={measureRef}
				aria-hidden
				className="absolute -top-[9999px] left-0 flex items-stretch h-7 gap-4 px-2 whitespace-nowrap pointer-events-none"
			>
				{entries.map((e) => (
					<LegendItem
						key={e.key}
						entry={e}
						showLabel={showLabels}
						forMeasurement
					/>
				))}
				<OverflowPill count={entries.length} total={overflowTotal} />
			</div>

			{/* Actual rendered layer. */}
			<div className="flex items-stretch h-7 gap-4 px-2 whitespace-nowrap">
				{visible.map((e) => (
					<LegendItem key={e.key} entry={e} showLabel={showLabels} />
				))}
				{overflow.length > 0 && (
					<HoverCard openDelay={0} closeDelay={0}>
						<HoverCardTrigger asChild>
							<button
								type="button"
								className="flex items-center gap-1.5 min-w-0 cursor-default focus:outline-none"
							>
								<OverflowPill count={overflow.length} total={overflowTotal} />
							</button>
						</HoverCardTrigger>
						<HoverCardContent align="end" className="w-auto max-w-xs p-2">
							<div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
								{overflow.map((e) => (
									<div key={e.key} className="flex items-center gap-2 min-w-0">
										<span
											className="w-2 h-2 rounded-sm shrink-0"
											style={{ background: e.color }}
										/>
										<span className="text-subtle text-tiny truncate min-w-0 flex-1">
											{e.label}
										</span>
										<span className="text-muted-foreground text-tiny tabular-nums shrink-0">
											{e.value.toLocaleString()}
										</span>
									</div>
								))}
							</div>
						</HoverCardContent>
					</HoverCard>
				)}
			</div>
		</div>
	);
}

function LegendItem({
	entry,
	showLabel,
	forMeasurement,
}: {
	entry: ChartLegendEntry;
	showLabel: boolean;
	forMeasurement?: boolean;
}) {
	return (
		<div className="flex items-center gap-1.5 min-w-0" title={entry.title}>
			<span
				className="w-2 h-2 rounded-sm shrink-0"
				style={{ background: entry.color }}
			/>
			{showLabel && (
				<span
					className={
						forMeasurement
							? "text-subtle text-tiny shrink-0"
							: "text-subtle text-tiny truncate min-w-0 max-w-[140px]"
					}
				>
					{entry.label}
				</span>
			)}
			<span className="text-muted-foreground text-tiny tabular-nums shrink-0">
				{entry.value.toLocaleString()}
			</span>
		</div>
	);
}

function OverflowPill({ count, total }: { count: number; total: number }) {
	return (
		<div className="flex items-center gap-1.5 min-w-0">
			<span className="w-2 h-2 rounded-sm shrink-0 bg-subtle" />
			<span className="text-subtle text-tiny shrink-0">+{count} more</span>
			<span className="text-muted-foreground text-tiny tabular-nums shrink-0">
				{total.toLocaleString()}
			</span>
		</div>
	);
}
