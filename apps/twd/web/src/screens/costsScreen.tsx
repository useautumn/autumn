import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@autumn/ui/components/ui/chart";
import { CurrencyDollarIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { Costs, RunSummary } from "../../../src/api/contract.ts";
import { type CostsFilter, useCosts } from "../api/hooks.ts";
import { RatesLine } from "../components/cost.tsx";
import { RunLabel } from "../components/runLabel.tsx";
import { Actor, ErrorCallout } from "../components/status.tsx";
import {
	DataTable,
	PageHeader,
	Panel,
	SectionTag,
	Segmented,
	Skeleton,
	Tooltip,
} from "../components/ui.tsx";
import { elapsed, handle, num, usd } from "../lib/format.ts";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];
type UserRow = Costs["users"][number];

const SERIES = 8;
const WARM_KEY = "warm";
const DAY_MS = 86_400_000;

const seriesColor = (i: number) => `var(--chart-series-${(i % SERIES) + 1})`;

const dayLabel = (iso: string) =>
	new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	}).format(new Date(iso));

const compactUsd = (n: number) =>
	n >= 1000 ? `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `$${n}`;

const CostChart = ({
	costs,
	bucket,
}: {
	costs: Costs;
	bucket: CostsFilter["bucket"];
}) => {
	const users = costs.users;
	const config: ChartConfig = {
		...Object.fromEntries(
			users.map((u, i) => [
				`u${i}`,
				{ label: handle(u.email), color: seriesColor(i) },
			]),
		),
		[WARM_KEY]: {
			label: "warm builds",
			color: "var(--chart-series-other)",
		},
	};
	const data = costs.buckets.map((b) => ({
		label: dayLabel(b.start),
		...Object.fromEntries(
			users.map((u, i) => [`u${i}`, b.byUser[u.email] ?? 0]),
		),
		[WARM_KEY]: b.warmUsd,
	}));
	const keys = [...users.map((_, i) => `u${i}`), WARM_KEY];
	return (
		<Panel className="flex flex-col overflow-hidden">
			<div className="flex h-8 shrink-0 items-center gap-4 overflow-hidden border-b bg-card px-3">
				{keys.map((key) => (
					<span key={key} className="flex min-w-0 items-center gap-1.5">
						<span
							className="size-2 shrink-0 rounded-sm"
							style={{ background: config[key]?.color }}
						/>
						<span className="truncate text-xs text-tertiary-foreground">
							{config[key]?.label}
						</span>
					</span>
				))}
			</div>
			<ChartContainer config={config} className="aspect-auto h-64 w-full">
				<BarChart
					data={data}
					barCategoryGap={bucket === "day" ? 3 : 10}
					margin={{ top: 16, right: 12, left: 4, bottom: 0 }}
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
						tickMargin={6}
						interval="equidistantPreserveStart"
						tick={{ fontSize: 11 }}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={44}
						tickCount={5}
						tick={{ fontSize: 11 }}
						tickFormatter={compactUsd}
					/>
					<ChartTooltip
						cursor={{ fill: "var(--muted)" }}
						content={
							<ChartTooltipContent
								className="min-w-44"
								formatter={(value, _name, item) => (
									<span className="flex w-full items-center gap-2">
										<span
											className="size-2 shrink-0 rounded-[2px]"
											style={{ background: item.color }}
										/>
										<span className="text-tertiary-foreground">
											{config[String(item.dataKey)]?.label}
										</span>
										<span className="ml-auto font-medium text-foreground tabular-nums">
											{usd(Number(value))}
										</span>
									</span>
								)}
							/>
						}
					/>
					{keys.map((key, i) => (
						<Bar
							key={key}
							dataKey={key}
							stackId="cost"
							fill={`var(--color-${key})`}
							radius={i === keys.length - 1 ? [3, 3, 0, 0] : 0}
							isAnimationActive={false}
						/>
					))}
				</BarChart>
			</ChartContainer>
		</Panel>
	);
};

export const CostsScreen = () => {
	const [bucket, setBucket] = useState<CostsFilter["bucket"]>("day");
	const [range, setRange] = useState<Range>(30);
	const [today] = useState(() => Math.floor(Date.now() / DAY_MS) * DAY_MS);
	const from = new Date(today - (range - 1) * DAY_MS)
		.toISOString()
		.slice(0, 10);
	const costs = useCosts({ from, bucket });
	const data = costs.data;
	const total = data?.totals.usd ?? 0;

	const userColumns: ColumnDef<UserRow>[] = [
		{
			id: "user",
			header: "User",
			size: 220,
			meta: { grow: true },
			cell: ({ row: { original: u, index } }) => (
				<span className="flex min-w-0 items-center gap-2">
					<span
						className="size-2 shrink-0 rounded-sm"
						style={{ background: seriesColor(index) }}
					/>
					<span className="truncate text-foreground">{u.email}</span>
				</span>
			),
		},
		{
			id: "runs",
			header: "Runs",
			size: 80,
			cell: ({ row: { original: u } }) => (
				<span className="tabular-nums">{num(u.runs)}</span>
			),
		},
		{
			id: "cost",
			header: "Cost",
			size: 100,
			cell: ({ row: { original: u } }) => (
				<span className="font-medium text-foreground tabular-nums">
					{usd(u.usd)}
				</span>
			),
		},
		{
			id: "share",
			header: "Share",
			size: 160,
			cell: ({ row: { original: u, index } }) => {
				const share = total ? u.usd / total : 0;
				return (
					<span className="flex items-center gap-2.5">
						<span className="relative h-1 w-16 overflow-hidden rounded-full bg-muted">
							<span
								className="absolute inset-y-0 left-0 rounded-full"
								style={{
									width: `${share * 100}%`,
									background: seriesColor(index),
								}}
							/>
						</span>
						<span className="text-xs text-tertiary-foreground tabular-nums">
							{(share * 100).toFixed(1)}%
						</span>
					</span>
				);
			},
		},
	];

	const runColumns: ColumnDef<RunSummary>[] = [
		{
			id: "run",
			header: "Run",
			size: 260,
			meta: { grow: true },
			cell: ({ row: { original: run } }) => (
				<span className="flex min-w-0 pr-4">
					<RunLabel run={run} />
				</span>
			),
		},
		{
			id: "who",
			header: "Who",
			size: 150,
			cell: ({ row: { original: run } }) => (
				<Actor actor={run.createdBy} compact />
			),
		},
		{
			id: "files",
			header: "Files",
			size: 80,
			cell: ({ row: { original: run } }) => (
				<span className="tabular-nums">
					{run.fileCount === null ? "—" : num(run.fileCount)}
				</span>
			),
		},
		{
			id: "duration",
			header: "Duration",
			size: 90,
			cell: ({ row: { original: run } }) => (
				<span className="text-xs tabular-nums">
					{elapsed({
						from: run.startedAt ?? run.createdAt,
						to: run.finishedAt,
						now: Date.now(),
					})}
				</span>
			),
		},
		{
			id: "cost",
			header: "Cost",
			size: 90,
			cell: ({ row: { original: run } }) => (
				<span className="font-medium text-foreground tabular-nums">
					{usd(run.cost.usd)}
				</span>
			),
		},
	];

	return (
		<>
			<PageHeader
				icon={<CurrencyDollarIcon size={16} weight="fill" />}
				title="Costs"
			>
				<Segmented
					label="Bucket"
					value={bucket}
					onChange={setBucket}
					options={[
						{ value: "day", label: "Day" },
						{ value: "week", label: "Week" },
					]}
				/>
				<Segmented
					label="Range"
					value={String(range)}
					onChange={(v) => setRange(Number(v) as Range)}
					options={RANGES.map((r) => ({
						value: String(r),
						label: <span className="tabular-nums">{r}d</span>,
					}))}
				/>
			</PageHeader>
			<ErrorCallout error={costs.error} className="mb-4" />

			<div className="flex min-h-5 flex-wrap items-center gap-x-1.5 pb-3 text-xs text-tertiary-foreground tabular-nums">
				{data ? (
					<>
						<span className="font-medium text-foreground">
							{usd(data.totals.usd)}
						</span>
						<span>
							· {num(data.totals.runs)} runs ·{" "}
							{formatWorkerTime(data.totals.workerSeconds)} ·{" "}
							{usd(data.totals.warmUsd)} warm builds · last {range} days
						</span>
						<Tooltip content={<RatesLine rates={data.rates} />}>
							<span className="ml-auto cursor-default text-subtle underline decoration-dotted underline-offset-2">
								Modal rates
							</span>
						</Tooltip>
					</>
				) : (
					<Skeleton className="h-4 w-80" />
				)}
			</div>

			{data ? (
				<CostChart costs={data} bucket={bucket} />
			) : (
				<Skeleton className="h-72 w-full" />
			)}

			<SectionTag className="mt-6">By user</SectionTag>
			<DataTable
				data={data?.users}
				isLoading={costs.isLoading}
				columns={userColumns}
				emptyText="No spend in this window."
			/>

			<SectionTag className="mt-6">Most expensive runs</SectionTag>
			<DataTable
				data={data?.topRuns}
				isLoading={costs.isLoading}
				columns={runColumns}
				getRowHref={(run) => `/runs/${run.id}`}
				emptyText="No runs in this window."
			/>
		</>
	);
};

const formatWorkerTime = (seconds: number) =>
	seconds < 3600
		? `${Math.round(seconds / 60)} worker-minutes`
		: `${num(Math.round(seconds / 3600))} worker-hours`;
