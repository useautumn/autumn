import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import type { Snapshot } from "../types";
import { FileStatusBadge } from "../widgets";

const HISTOGRAM_CONFIG = {
	count: { label: "files", color: "#27a7ff" },
};

/** Bucket edges in seconds — log-ish steps so both 5s and 5min files read well. */
const BUCKETS_S = [10, 20, 30, 45, 60, 90, 120, 180, 240, 360, 600];

const bucketLabel = (index: number): string => {
	if (index === 0) {
		return `<${BUCKETS_S[0]}s`;
	}
	if (index >= BUCKETS_S.length) {
		return `>${BUCKETS_S[BUCKETS_S.length - 1] / 60}m`;
	}
	const lo = BUCKETS_S[index - 1];
	const hi = BUCKETS_S[index];
	return hi >= 120 ? `${lo / 60}-${hi / 60}m` : `${lo}-${hi}s`;
};

/**
 * Live distribution of per-file wall durations (dispatch → verdict) plus the
 * slowest-files leaderboard — the "which tests are worth remaking" view.
 */
export function Timings({ snap }: { snap: Snapshot }) {
	const timed = useMemo(
		() =>
			snap.files
				.filter(
					(f): f is typeof f & { durationMs: number } =>
						typeof f.durationMs === "number" && f.durationMs > 0,
				)
				.sort((a, b) => b.durationMs - a.durationMs),
		[snap.files],
	);

	const histogram = useMemo(() => {
		const counts = new Array(BUCKETS_S.length + 1).fill(0);
		for (const f of timed) {
			const s = f.durationMs / 1000;
			const index = BUCKETS_S.findIndex((edge) => s < edge);
			counts[index === -1 ? BUCKETS_S.length : index]++;
		}
		return counts.map((count, index) => ({
			bucket: bucketLabel(index),
			count,
		}));
	}, [timed]);

	if (timed.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
				waiting for the first completed file…
			</div>
		);
	}

	const totalMs = timed.reduce((sum, f) => sum + f.durationMs, 0);
	const median = timed[Math.floor(timed.length / 2)]?.durationMs ?? 0;

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
			<div className="flex shrink-0 flex-wrap items-center gap-4 text-muted-foreground text-xs">
				<span>
					{timed.length} completed · median{" "}
					<span className="font-mono text-foreground tabular-nums">
						{(median / 1000).toFixed(1)}s
					</span>{" "}
					· cumulative test time{" "}
					<span className="font-mono text-foreground tabular-nums">
						{(totalMs / 60000).toFixed(1)}min
					</span>
				</span>
			</div>
			<div className="shrink-0 rounded-lg border bg-card p-3">
				<div className="mb-2 font-medium text-muted-foreground text-xs">
					duration distribution
				</div>
				<ChartContainer className="h-56 w-full" config={HISTOGRAM_CONFIG}>
					<BarChart
						data={histogram}
						margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
					>
						<CartesianGrid stroke="var(--chart-grid-stroke)" vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="bucket"
							fontSize={11}
							tickLine={false}
						/>
						<YAxis
							allowDecimals={false}
							axisLine={false}
							fontSize={11}
							tickLine={false}
							width={28}
						/>
						<ChartTooltip content={<ChartTooltipContent />} />
						<Bar
							dataKey="count"
							fill="#27a7ff"
							isAnimationActive={false}
							radius={[3, 3, 0, 0]}
						/>
					</BarChart>
				</ChartContainer>
			</div>
			<div className="min-h-0 rounded-lg border bg-card">
				<div className="border-b p-3 font-medium text-muted-foreground text-xs">
					slowest files
				</div>
				<div className="divide-y">
					{timed.slice(0, 30).map((f) => (
						<div
							className="flex items-center justify-between gap-2 px-3 py-1.5"
							key={f.file}
						>
							<span className="truncate font-mono text-tertiary-foreground text-xs">
								{f.name}
							</span>
							<span className="flex shrink-0 items-center gap-2">
								<FileStatusBadge status={f.status} />
								<span className="w-16 text-right font-mono text-foreground text-xs tabular-nums">
									{(f.durationMs / 1000).toFixed(1)}s
								</span>
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
