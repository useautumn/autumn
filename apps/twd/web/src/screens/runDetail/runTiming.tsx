import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@autumn/ui/components/ui/chart";
import type { ReactNode } from "react";
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
import type { RunTiming } from "../../../../src/internal/runs/timing/summariseRunTiming.ts";
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

export const mmss = (ms: number) => {
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const SheetSection = ({
	title,
	right,
	children,
	className,
}: {
	title: string;
	right?: ReactNode;
	children: ReactNode;
	className?: string;
}) => (
	<section className={cn("flex min-w-0 flex-col gap-1.5", className)}>
		<div className="flex items-baseline justify-between gap-3">
			<h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
			{right && (
				<span className="text-[11px] text-tertiary-foreground tabular-nums">
					{right}
				</span>
			)}
		</div>
		{children}
	</section>
);

/** The phase a live run is in now, named like the finished phases so the legend stays one vocabulary. */
const currentPhase = ({
	status,
	warmReady,
}: {
	status: RunDetail["status"];
	warmReady: number | null;
}) => {
	if (status === "warming") return "warm image";
	if (status === "queued")
		return warmReady === null ? "warm image" : "waiting for accounts";
	if (status === "provisioning") return "first worker boot";
	if (status === "running") return "tests";
	if (status === "tearing_down") return "teardown";
	return null;
};

/** Sequential wall-time phases; a live run's current phase grows at the end. */
export const PhaseBar = ({
	timing,
	status,
}: {
	timing: RunTiming;
	status: RunDetail["status"];
}) => {
	const counted = timing.phases.reduce((sum, p) => sum + p.ms, 0);
	const livePhase = currentPhase({ status, warmReady: timing.marks.warmReady });
	const current =
		livePhase && !timing.phases.some((p) => p.phase === livePhase)
			? {
					phase: livePhase,
					ms: Math.max(0, timing.wallMs - counted),
					live: true,
				}
			: null;
	const phases = [
		...timing.phases.map((p) => ({ ...p, live: false })),
		...(current && current.ms > 0 ? [current] : []),
	];
	if (phases.length === 0)
		return <p className="text-xs text-subtle">No phases recorded yet.</p>;
	const total = phases.reduce((sum, p) => sum + p.ms, 0) || 1;
	return (
		<div className="flex flex-col gap-2">
			<div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
				{phases.map((p) => (
					<div
						key={p.phase}
						title={`${p.phase} · ${formatMs(p.ms)}`}
						className={cn(
							"h-full",
							PHASE_COLORS[p.phase],
							p.live && "twd-pulse",
						)}
						style={{ width: `${(p.ms / total) * 100}%` }}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-tertiary-foreground">
				{phases.map((p) => (
					<span key={p.phase} className="flex items-center gap-1.5">
						<span
							className={cn("size-2 rounded-[2px]", PHASE_COLORS[p.phase])}
						/>
						{p.phase}
						<span className="font-semibold text-foreground tabular-nums">
							{formatMs(p.ms)}
							{p.live && "…"}
						</span>
					</span>
				))}
			</div>
		</div>
	);
};

export const CompletionChart = ({
	timing,
	fileCount,
}: {
	timing: RunTiming;
	fileCount: number;
}) => {
	const { marks, wallMs } = timing;
	const refs = [marks.lastWorkerReady, marks.ninetyFilesDone].filter(
		(at): at is number => at !== null,
	);
	return (
		<ChartContainer
			config={completionConfig}
			className="aspect-auto h-32 w-full"
		>
			<AreaChart
				data={timing.completion}
				margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
			>
				<CartesianGrid vertical={false} stroke="var(--chart-grid-stroke)" />
				<XAxis
					dataKey="atMs"
					type="number"
					domain={[0, wallMs]}
					tickFormatter={mmss}
					tickLine={false}
					axisLine={false}
					tick={{ fontSize: 10 }}
				/>
				<YAxis
					width={30}
					tickLine={false}
					axisLine={false}
					tick={{ fontSize: 10 }}
					domain={[0, fileCount]}
				/>
				{refs.map((at) => (
					<ReferenceLine
						key={at}
						x={at}
						stroke="var(--chart-series-1)"
						strokeOpacity={0.45}
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
					fillOpacity={0.12}
					isAnimationActive={false}
				/>
			</AreaChart>
		</ChartContainer>
	);
};

export const DurationHistogram = ({ timing }: { timing: RunTiming }) => (
	<ChartContainer config={histogramConfig} className="aspect-auto h-32 w-full">
		<BarChart
			data={timing.histogram}
			margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
		>
			<CartesianGrid vertical={false} stroke="var(--chart-grid-stroke)" />
			<XAxis
				dataKey="bucket"
				tickLine={false}
				axisLine={false}
				tick={{ fontSize: 10 }}
				interval="preserveStartEnd"
			/>
			<YAxis
				width={30}
				tickLine={false}
				axisLine={false}
				tick={{ fontSize: 10 }}
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
				radius={[2, 2, 0, 0]}
				isAnimationActive={false}
			/>
		</BarChart>
	</ChartContainer>
);

/** The slowest files, which set the wall time. */
export const LongTail = ({
	timing,
	onOpenFile,
}: {
	timing: RunTiming;
	onOpenFile: (file: string) => void;
}) => (
	<div className="flex flex-col">
		{timing.slowest.map((f) => (
			<button
				key={f.file}
				type="button"
				onClick={() => onOpenFile(f.file)}
				title={f.file}
				className="-mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-[3px] text-left outline-none hover:bg-muted focus-visible:bg-muted"
			>
				<span className="w-12 shrink-0 text-xs font-semibold text-foreground tabular-nums">
					{formatMs(f.durationMs)}
				</span>
				<span className="truncate font-mono text-[11px] text-muted-foreground">
					…/{f.file.split("/").slice(-2).join("/")}
				</span>
				{f.attempt > 1 && (
					<span className="ml-auto shrink-0 text-[11px] text-amber-600 dark:text-amber-400">
						attempt {num(f.attempt)}
					</span>
				)}
			</button>
		))}
	</div>
);
