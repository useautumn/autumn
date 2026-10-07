import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@autumn/ui/components/ui/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { RunSummary } from "../../../../src/api/contract.ts";
import { useRuns } from "../../api/hooks.ts";
import { Panel, Skeleton } from "../../components/ui.tsx";
import { formatDate, num, sha7 } from "../../lib/format.ts";

const HISTORY_LIMIT = 60;

const config = {
	rate: { label: "Pass rate", color: "var(--chart-series-3)" },
} satisfies ChartConfig;

type Point = {
	label: string;
	rate: number;
	passed: number;
	total: number;
	run: RunSummary;
};

const dayLabel = (iso: string) =>
	new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
		new Date(iso),
	);

const toPoint = (run: RunSummary): Point => {
	const total = run.fileCount ?? 0;
	return {
		label: dayLabel(run.createdAt),
		rate: total ? (run.passed / total) * 100 : 0,
		passed: run.passed,
		total,
		run,
	};
};

/** Passed/total files of recent completed baseline runs, oldest first; cancelled runs are skipped. */
export const BaselinePassRateChart = ({ branch }: { branch?: string }) => {
	const baselines = useRuns({
		status: "finished",
		baseline: true,
		branch,
		limit: HISTORY_LIMIT,
	});
	const points = (baselines.data?.runs ?? [])
		.filter((r) => r.status !== "cancelled" && r.fileCount)
		.reverse()
		.map(toPoint);
	const floor = Math.min(90, ...points.map((p) => Math.floor(p.rate)));

	return (
		<Panel className="mb-3 shrink-0 px-3 pt-2 pb-1">
			<p className="flex items-center justify-between text-xs text-subtle">
				<span>Baseline pass rate · last {num(points.length)} runs</span>
				{points.length > 0 && (
					<span className="tabular-nums">
						latest {points.at(-1)?.rate.toFixed(1)}%
					</span>
				)}
			</p>
			{baselines.isLoading ? (
				<Skeleton className="my-2 h-20 w-full" />
			) : points.length < 2 ? (
				<p className="py-8 text-center text-xs text-subtle">
					Not enough finished baseline runs to chart yet.
				</p>
			) : (
				<ChartContainer
					config={config}
					className="aspect-auto h-20 w-full [@media(min-height:820px)]:h-28"
				>
					<LineChart
						data={points}
						margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
					>
						<CartesianGrid
							vertical={false}
							stroke="var(--chart-grid-stroke)"
							strokeDasharray="2 2"
						/>
						<XAxis
							dataKey="label"
							tickLine={false}
							axisLine={false}
							tickMargin={4}
							interval="equidistantPreserveStart"
							tick={{ fontSize: 10 }}
						/>
						<YAxis
							domain={[floor, 100]}
							width={40}
							tickCount={3}
							tickLine={false}
							axisLine={false}
							tick={{ fontSize: 10 }}
							tickFormatter={(v) => `${v}%`}
						/>
						<ChartTooltip
							cursor={{ stroke: "var(--border)" }}
							content={({ payload }) => {
								const p = payload?.[0]?.payload as Point | undefined;
								if (!p) return null;
								return (
									<div className="rounded-md border bg-background px-2 py-1 text-xs shadow-sm">
										<div className="text-foreground tabular-nums">
											{num(p.passed)} / {num(p.total)} passed ·{" "}
											{p.rate.toFixed(1)}%
										</div>
										<div className="text-tiny-id text-tertiary-foreground">
											{sha7(p.run.sha)} · {p.run.branch}
										</div>
										<div className="text-subtle">
											{formatDate(p.run.createdAt)}
										</div>
									</div>
								);
							}}
						/>
						<Line
							dataKey="rate"
							type="monotone"
							stroke="var(--color-rate)"
							strokeWidth={1.5}
							dot={{ r: 2, fill: "var(--color-rate)", strokeWidth: 0 }}
							activeDot={{ r: 3.5 }}
							isAnimationActive={false}
						/>
					</LineChart>
				</ChartContainer>
			)}
		</Panel>
	);
};
