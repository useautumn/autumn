import {
	type ApiByocCache,
	ATOM_DISK_EVICTION_SHARE,
	type AtomMetricsRange,
	type AtomVolume,
	BYOC_CACHE_REPLICAS,
} from "@autumn/shared";
import { Alert, Skeleton } from "@autumn/ui";
import { WarningIcon } from "@phosphor-icons/react";
import { Bar, LabelList, Line, ReferenceDot, ReferenceLine } from "recharts";
import { useNow } from "@/hooks/common/useNow";
import { atomStorageMonthlyEstimate } from "../atomVolumeDisplay";
import type {
	AtomMetricsChartData,
	AtomMetricsSeries,
} from "./atomMetricsChartData";
import { formatPercent } from "./atomMetricsFormat";
import {
	atomEvictionBuckets,
	atomEvictionsTotal,
	atomReplicaLines,
	atomReplicasReporting,
	atomVolumeUsage,
	EVICTION_BUCKETS,
	formatEvictionCount,
	formatEvictionsTotal,
	formatUpdatedAgo,
} from "./atomStorageDisplay";
import { MonitoringChartCard } from "./MonitoringChartCard";
import { MonitoringPlot } from "./MonitoringPlot";

const UNAVAILABLE = "Storage metrics unavailable";

const DISK: AtomMetricsSeries = {
	key: "disk",
	label: "Disk used",
	color: "var(--chart-series-1)",
};

const EVICTED: AtomMetricsSeries = {
	key: "evicted",
	label: "Customers evicted",
	color: "var(--chart-series-4)",
};

const DISK_TICKS = [0, 0.4, ATOM_DISK_EVICTION_SHARE, 1];

/** Room above the tallest bar for its label. */
const BAR_LABEL_HEADROOM = 1.6;

const PLOT_LABEL_CLASS = "pl-10 text-xs text-tertiary-foreground";

/** The fullest replica's volume, and how many customers the window evicted, with a warning while it evicts. */
const StorageSummary = ({
	volumes,
	evictionsTotal,
	range,
	isLoading,
}: {
	volumes: AtomVolume[];
	evictionsTotal: number | null;
	range: AtomMetricsRange;
	isLoading: boolean;
}) => {
	const usage = atomVolumeUsage(volumes[0]);
	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-start justify-between gap-6">
				<div className="flex flex-col gap-2">
					<span className="text-xs text-tertiary-foreground">
						Volume usage · fullest replica
					</span>
					{isLoading ? (
						<Skeleton className="h-[30px] w-40" />
					) : usage ? (
						<span className="flex items-baseline gap-2">
							<span className="text-[25px] leading-[30px] font-medium tabular-nums text-foreground">
								{usage.used} / {usage.total} GiB
							</span>
							<span className="text-[15px] text-tertiary-foreground">
								· {formatPercent(usage.share)}
							</span>
						</span>
					) : (
						<span className="text-[17px] leading-[30px] text-tertiary-foreground">
							{UNAVAILABLE}
						</span>
					)}
					<span className="text-xs leading-[18px] text-tertiary-foreground">
						Per replica · {atomReplicasReporting(volumes.length)}
					</span>
				</div>
				{evictionsTotal !== null && (
					<div className="flex flex-col items-end gap-2 text-right">
						<span className="text-xs text-tertiary-foreground">
							Cache evictions · selected window
						</span>
						<span className="text-[17px] leading-[30px] font-medium tabular-nums text-foreground">
							{formatEvictionsTotal({ total: evictionsTotal, range })}
						</span>
						<span className="text-[11px] leading-[18px] text-tertiary-foreground">
							Eviction events across both replicas · not unique customers
						</span>
					</div>
				)}
			</div>
			{evictionsTotal !== null && evictionsTotal > 0 && (
				<Alert
					variant="warning"
					className="flex items-start gap-2 rounded-md border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-[18px] text-amber-200/90"
				>
					<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
					Atom is clearing cached customers to stay under{" "}
					{formatPercent(ATOM_DISK_EVICTION_SHARE)} disk. Their next checks go
					to the API. Increase storage to keep them local.
				</Alert>
			)}
		</div>
	);
};

/** Disk used against the 80% line, and above the same time axis the evictions it set off, per bucket. */
const StoragePlots = ({
	chartData,
	range,
}: {
	chartData: AtomMetricsChartData;
	range: AtomMetricsRange;
}) => {
	const bucket = EVICTION_BUCKETS[range];
	const buckets = atomEvictionBuckets({ chartData, bucketMs: bucket.ms });
	const mostEvicted = Math.max(1, ...buckets.map((row) => row.evicted ?? 0));
	const latestDisk = chartData.latest.disk;
	return (
		<div className="flex size-full flex-col gap-1.5">
			<span className={PLOT_LABEL_CLASS}>{DISK.label}</span>
			<div className="h-40">
				<MonitoringPlot
					chartData={chartData}
					series={[DISK]}
					yTicks={DISK_TICKS}
					formatValue={formatPercent}
					showTimeTicks={false}
				>
					<ReferenceLine
						y={ATOM_DISK_EVICTION_SHARE}
						stroke="var(--tertiary-foreground)"
						strokeDasharray="5 4"
						label={{
							value: `${formatPercent(ATOM_DISK_EVICTION_SHARE)} · eviction starts`,
							position: "insideBottomRight",
							fontSize: 11,
							fill: "var(--tertiary-foreground)",
						}}
					/>
					<Line
						dataKey={DISK.key}
						type="monotone"
						stroke={DISK.color}
						strokeWidth={2}
						dot={false}
						activeDot={{ r: 3, strokeWidth: 0 }}
						isAnimationActive={false}
					/>
					{latestDisk !== null && (
						<ReferenceDot
							x={chartData.latest.x}
							y={latestDisk}
							r={3}
							fill={DISK.color}
							stroke="none"
						/>
					)}
				</MonitoringPlot>
			</div>
			<span className={PLOT_LABEL_CLASS}>{bucket.label}</span>
			<div className="h-[76px]">
				<MonitoringPlot
					chartData={chartData}
					rows={buckets}
					series={[EVICTED]}
					yTicks={[0, mostEvicted * BAR_LABEL_HEADROOM]}
					formatValue={formatEvictionCount}
					showValueTicks={false}
				>
					<ReferenceLine y={0} stroke="var(--chart-grid-stroke)" />
					<Bar
						dataKey={EVICTED.key}
						fill={EVICTED.color}
						fillOpacity={0.75}
						barSize={14}
						radius={2}
						isAnimationActive={false}
					>
						<LabelList
							dataKey={EVICTED.key}
							position="top"
							fontSize={11}
							fill={EVICTED.color}
							formatter={(value) =>
								formatEvictionCount(typeof value === "number" ? value : null)
							}
						/>
					</Bar>
				</MonitoringPlot>
			</div>
		</div>
	);
};

/** Each replica's volume, and the size both run with and its price. */
const StorageFooter = ({
	volumes,
	volumeSizeGib,
}: {
	volumes: AtomVolume[];
	volumeSizeGib: number;
}) => (
	<div className="flex flex-wrap justify-between gap-4 border-t border-table-row-divider pt-3 text-xs leading-[18px] text-tertiary-foreground">
		{atomReplicaLines(volumes).map((line) => (
			<span key={line}>{line}</span>
		))}
		<span>
			{BYOC_CACHE_REPLICAS} × {volumeSizeGib} GiB ·{" "}
			{atomStorageMonthlyEstimate({ volumeSizeGib })} / mo
		</span>
	</div>
);

/** How full the fullest replica's volume is, and how often Atom evicts to keep it under 80%. */
export const AtomStorageChart = ({
	cache,
	chartData,
	volumes,
	range,
	isLoading,
}: {
	cache: ApiByocCache | null;
	chartData: AtomMetricsChartData | null;
	volumes: AtomVolume[];
	range: AtomMetricsRange;
	isLoading: boolean;
}) => {
	const latestVolume = volumes[0];
	const now = useNow({ active: Boolean(latestVolume) });
	const hasDisk = Boolean(chartData?.rows.some((row) => row.disk !== null));

	return (
		<MonitoringChartCard
			title="Storage"
			description={[
				"Fullest replica",
				latestVolume && `updated ${formatUpdatedAgo(now - latestVolume.at)}`,
			]
				.filter(Boolean)
				.join(" · ")}
			summary={
				<StorageSummary
					volumes={volumes}
					evictionsTotal={chartData && atomEvictionsTotal(chartData)}
					range={range}
					isLoading={isLoading}
				/>
			}
			footer={
				cache && (
					<StorageFooter
						volumes={volumes}
						volumeSizeGib={cache.volume_size_gib}
					/>
				)
			}
			isLoading={isLoading}
			isEmpty={!hasDisk}
			emptyLabel={UNAVAILABLE}
			plotClassName="h-[280px]"
		>
			{chartData && <StoragePlots chartData={chartData} range={range} />}
		</MonitoringChartCard>
	);
};
