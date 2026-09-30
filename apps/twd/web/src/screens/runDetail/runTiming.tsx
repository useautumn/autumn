import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@autumn/ui/components/ui/chart";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";
import type { RunDetail } from "../../../../src/api/contract.ts";
import { summariseRunTiming } from "../../../../src/internal/runs/timing/summariseRunTiming.ts";
import { Panel, SectionTag } from "../../components/ui.tsx";
import { cn, formatMs, num } from "../../lib/format.ts";

const PHASE_COLORS: Record<string, string> = {
	"warm image": "bg-amber-500",
	"waiting for accounts": "bg-rose-500",
	"first worker boot": "bg-violet-500",
	tests: "bg-emerald-500",
	teardown: "bg-slate-500",
};

const completionConfig = {
	done: { label: "Files done", color: "var(--chart-series-1)" },
} satisfies ChartConfig;
const histogramConfig = {
	passed: { label: "Passed", color: "var(--chart-series-3)" },
	failed: { label: "Failed", color: "var(--chart-series-5)" },
} satisfies ChartConfig;

const mmss = (ms: number) => {
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Where the run's wall time went: phase bar, completion curve, duration histogram, long tail. */
export const RunTimingPanel = ({
	run,
	onOpenFile,
}: {
	run: RunDetail;
	onOpenFile: (file: string) => void;
}) => {
	const timing = summariseRunTiming(run);
	if (timing.completion.length === 0) return null;
	const { marks, phases, wallMs } = timing;
	const total = phases.reduce((sum, p) => sum + p.ms, 0) || 1;
	const refs = [
		{ at: marks.lastWorkerReady, label: "all workers" },
		{ at: marks.ninetyFilesDone, label: "90%" },
	].filter((r): r is { at: number; label: string } => r.at !== null);

	return (
		<section>
			<SectionTag>
				Timing{" "}
				<span className="text-subtle tabular-nums">
					{formatMs(wallMs)} wall
				</span>
			</SectionTag>
			<Panel className="flex flex-col gap-4 p-3">
				<div className="flex flex-col gap-2">
					<div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
						{phases.map((p) => (
							<div
								key={p.phase}
								title={`${p.phase} · ${formatMs(p.ms)}`}
								className={cn("h-full", PHASE_COLORS[p.phase])}
								style={{ width: `${(p.ms / total) * 100}%` }}
							/>
						))}
					</div>
					<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tertiary-foreground">
						{phases.map((p) => (
							<span key={p.phase} className="flex items-center gap-1.5">
								<span
									className={cn("size-2 rounded-sm", PHASE_COLORS[p.phase])}
								/>
								{p.phase}
								<span className="text-foreground tabular-nums">
									{formatMs(p.ms)}
								</span>
							</span>
						))}
					</div>
				</div>

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<div>
						<p className="mb-1 text-xs text-subtle">
							Files done over time
							{marks.lastWorkerReady !== null &&
								` · all workers up ${mmss(marks.lastWorkerReady)}`}
							{marks.halfFilesDone !== null &&
								` · 50% at ${mmss(marks.halfFilesDone)}`}
							{marks.ninetyFilesDone !== null &&
								` · 90% at ${mmss(marks.ninetyFilesDone)}`}
						</p>
						<ChartContainer
							config={completionConfig}
							className="aspect-auto h-40 w-full"
						>
							<AreaChart
								data={timing.completion}
								margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
							>
								<CartesianGrid
									vertical={false}
									stroke="var(--chart-grid-stroke)"
									strokeDasharray="2 2"
								/>
								<XAxis
									dataKey="atMs"
									type="number"
									domain={[0, wallMs]}
									tickFormatter={mmss}
									tickLine={false}
									axisLine={false}
									tick={{ fontSize: 11 }}
								/>
								<YAxis
									width={36}
									tickLine={false}
									axisLine={false}
									tick={{ fontSize: 11 }}
									domain={[0, run.files.length]}
								/>
								{refs.map((r) => (
									<ReferenceLine
										key={r.label}
										x={r.at}
										stroke="var(--border)"
										strokeDasharray="3 3"
									/>
								))}
								<ChartTooltip
									content={
										<ChartTooltipContent
											labelFormatter={(_, items) =>
												mmss(Number(items?.[0]?.payload?.atMs ?? 0))
											}
										/>
									}
								/>
								<Area
									dataKey="done"
									type="stepAfter"
									stroke="var(--color-done)"
									fill="var(--color-done)"
									fillOpacity={0.15}
									isAnimationActive={false}
								/>
							</AreaChart>
						</ChartContainer>
					</div>
					<div>
						<p className="mb-1 text-xs text-subtle">File durations</p>
						<ChartContainer
							config={histogramConfig}
							className="aspect-auto h-40 w-full"
						>
							<BarChart
								data={timing.histogram}
								margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
							>
								<CartesianGrid
									vertical={false}
									stroke="var(--chart-grid-stroke)"
									strokeDasharray="2 2"
								/>
								<XAxis
									dataKey="bucket"
									tickLine={false}
									axisLine={false}
									tick={{ fontSize: 11 }}
								/>
								<YAxis
									width={36}
									tickLine={false}
									axisLine={false}
									tick={{ fontSize: 11 }}
									allowDecimals={false}
								/>
								<ChartTooltip
									cursor={{ fill: "var(--muted)" }}
									content={<ChartTooltipContent />}
								/>
								<Bar
									dataKey="passed"
									stackId="d"
									fill="var(--color-passed)"
									isAnimationActive={false}
								/>
								<Bar
									dataKey="failed"
									stackId="d"
									fill="var(--color-failed)"
									radius={[3, 3, 0, 0]}
									isAnimationActive={false}
								/>
							</BarChart>
						</ChartContainer>
					</div>
				</div>

				{timing.slowest.length > 0 && (
					<div className="flex flex-col gap-1 text-xs">
						<p className="text-subtle">
							Long tail · the slowest files set the wall time
						</p>
						{timing.slowest.map((f) => (
							<button
								key={f.file}
								type="button"
								onClick={() => onOpenFile(f.file)}
								className="flex cursor-pointer items-center gap-3 rounded-md px-1.5 py-0.5 text-left hover:bg-muted"
							>
								<span className="w-14 shrink-0 text-right text-foreground tabular-nums">
									{formatMs(f.durationMs)}
								</span>
								<span className="truncate text-tiny-id">{f.file}</span>
								{f.attempt > 1 && (
									<span className="ml-auto shrink-0 text-amber-500">
										attempt {num(f.attempt)}
									</span>
								)}
							</button>
						))}
					</div>
				)}
			</Panel>
		</section>
	);
};
