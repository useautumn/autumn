import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@autumn/ui/components/ui/chart";
import {
	CartesianGrid,
	ReferenceLine,
	Scatter,
	ScatterChart,
	XAxis,
	YAxis,
} from "recharts";
import { useFileHistory } from "../../api/hooks.ts";
import { formatMs, sha7 } from "../../lib/format.ts";

const config = {
	passed: { label: "Passed", color: "var(--chart-series-3)" },
	failed: { label: "Failed", color: "var(--chart-series-5)" },
} satisfies ChartConfig;

const dayTime = (ms: number) =>
	new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		hour: "numeric",
	}).format(ms);

type Point = {
	at: number;
	ms: number;
	sha: string;
	branch: string;
	runId: string;
	current: boolean;
};

/** Every recorded run of this file over time; the dot for the open run is ringed. */
export const FileHistoryChart = ({
	file,
	runId,
}: {
	file: string;
	runId: string;
}) => {
	const history = useFileHistory({ file });
	const results = history.data?.results ?? [];
	if (results.length < 2) return null;
	const toPoint = (r: (typeof results)[number]): Point => ({
		at: Date.parse(r.createdAt),
		ms: r.durationMs,
		sha: r.sha,
		branch: r.branch,
		runId: r.runId,
		current: r.runId === runId,
	});
	const passed = results.filter((r) => r.status === "passed").map(toPoint);
	const failed = results.filter((r) => r.status !== "passed").map(toPoint);
	const commits = history.data?.byCommit ?? [];
	const p90 = history.data?.baseline?.p90Ms;

	return (
		<div className="border-b px-4 py-3">
			<p className="mb-1 flex items-center justify-between text-xs text-subtle">
				<span>
					History · {results.length} runs across {commits.length} commits
				</span>
				{p90 !== undefined && <span>dev p90 {formatMs(p90)}</span>}
			</p>
			<ChartContainer config={config} className="aspect-auto h-32 w-full">
				<ScatterChart margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
					<CartesianGrid
						vertical={false}
						stroke="var(--chart-grid-stroke)"
						strokeDasharray="2 2"
					/>
					<XAxis
						dataKey="at"
						type="number"
						domain={["dataMin", "dataMax"]}
						tickFormatter={dayTime}
						tickLine={false}
						axisLine={false}
						tick={{ fontSize: 10 }}
					/>
					<YAxis
						dataKey="ms"
						width={44}
						tickFormatter={(v) => formatMs(Number(v))}
						tickLine={false}
						axisLine={false}
						tick={{ fontSize: 10 }}
					/>
					{p90 !== undefined && (
						<ReferenceLine
							y={p90}
							stroke="var(--border)"
							strokeDasharray="3 3"
						/>
					)}
					<ChartTooltip
						cursor={false}
						content={({ payload }) => {
							const p = payload?.[0]?.payload as Point | undefined;
							if (!p) return null;
							return (
								<div className="rounded-md border bg-background px-2 py-1 text-xs shadow-sm">
									<div className="tabular-nums text-foreground">
										{formatMs(p.ms)}
									</div>
									<div className="text-tiny-id text-tertiary-foreground">
										{sha7(p.sha)} · {p.branch}
									</div>
									<div className="text-subtle">{dayTime(p.at)}</div>
								</div>
							);
						}}
					/>
					{(["passed", "failed"] as const).map((key) => (
						<Scatter
							key={key}
							data={key === "passed" ? passed : failed}
							fill={`var(--color-${key})`}
							isAnimationActive={false}
							shape={(props: { cx?: number; cy?: number; payload?: Point }) => (
								<circle
									cx={props.cx}
									cy={props.cy}
									r={props.payload?.current ? 4.5 : 2.5}
									fill={`var(--color-${key})`}
									stroke={props.payload?.current ? "var(--foreground)" : "none"}
									strokeWidth={1.5}
								/>
							)}
						/>
					))}
				</ScatterChart>
			</ChartContainer>
		</div>
	);
};
