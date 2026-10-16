import {
	type ApiByocCache,
	ATOM_DISK_EVICTION_SHARE,
	type AtomMetricsRange,
	type AtomVolume,
	BYOC_CACHE_REPLICAS,
	ByocCacheStatus,
} from "@autumn/shared";
import { Button } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Bar, LabelList, Line, ReferenceDot, ReferenceLine } from "recharts";
import { toast } from "sonner";
import { useAtomUpdateQuery } from "@/hooks/queries/useAtomUpdateQuery";
import { cn } from "@/lib/utils";
import { IncreaseStorageDialog } from "../IncreaseStorageDialog";
import { useAtomActions } from "../useAtomActions";
import { AtomStorageGrowProgress } from "./AtomStorageGrowProgress";
import type {
	AtomMetricsChartData,
	AtomMetricsSeries,
} from "./atomMetricsChartData";
import { formatPercent } from "./atomMetricsFormat";
import {
	atomEvictionBuckets,
	atomEvictionsTotal,
	atomReplicaLines,
	atomVolumeUsage,
	EVICTION_BUCKETS,
	formatEvictionCount,
	formatEvictionsCount,
} from "./atomStorageDisplay";
import {
	type AtomStorageGrowth,
	atomStorageGrowth,
	isAtomStorageGrowing,
} from "./atomStorageGrowth";
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

/** The fullest replica's volume, and how many customers the window evicted. */
const StorageSummary = ({
	volumes,
	evictionsTotal,
}: {
	volumes: AtomVolume[];
	evictionsTotal: number | null;
}) => {
	const usage = atomVolumeUsage(volumes[0]);
	return (
		<div className="flex items-baseline justify-between gap-4 text-sm tabular-nums">
			{usage && (
				<span className="text-foreground">
					{usage.used} / {usage.total} GiB
					<span className="text-tertiary-foreground">
						{" "}
						· {formatPercent(usage.share)}
					</span>
				</span>
			)}
			{evictionsTotal !== null && (
				<span
					className={cn(
						"text-tertiary-foreground",
						evictionsTotal > 0 && "text-amber-500",
					)}
				>
					{formatEvictionsCount(evictionsTotal)}
				</span>
			)}
		</div>
	);
};

/** What the card measures, and each replica's own reading. */
const StorageInfo = ({ volumes }: { volumes: AtomVolume[] }) => (
	<div className="flex max-w-72 flex-col gap-1.5">
		<p>
			Disk used on the fullest replica. Above{" "}
			{formatPercent(ATOM_DISK_EVICTION_SHARE)}, Atom evicts cached customers;
			their next checks go to the API until they are cached again.
		</p>
		<p>Evictions count events across both replicas, not unique customers.</p>
		<p>
			{volumes.length > 0
				? atomReplicaLines(volumes).join(" · ")
				: "Readings come from the Atom's health reports in Axiom, so they are unavailable on a local dev stack and until the Atom first reports."}
		</p>
	</div>
);

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

/** Toasts the grow's end once, when the card sees it finish or fail. */
const useGrowthToasts = (growth: AtomStorageGrowth | null) => {
	const previous = useRef(growth?.phase);
	useEffect(() => {
		const wasGrowing =
			previous.current === "requested" || previous.current === "growing";
		previous.current = growth?.phase;
		if (!growth || !wasGrowing) return;
		if (growth.phase === "complete")
			toast.success(`Storage grown to ${growth.targetGib} GiB per replica`);
		if (growth.phase === "failed")
			toast.error(
				growth.error ?? `Growing storage to ${growth.targetGib} GiB failed`,
			);
	}, [growth?.phase]);
};

/** How full the fullest replica's volume is, how often Atom evicts to keep it under 80%, and growing it. */
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
	const { increaseStorage } = useAtomActions();
	const [isIncreaseOpen, setIncreaseOpen] = useState(false);
	const isReady = cache?.status === ByocCacheStatus.Ready;
	const [isPolling, setPolling] = useState(false);
	const update = useAtomUpdateQuery({ enabled: isReady, isActive: isPolling });
	const growth =
		cache &&
		atomStorageGrowth({
			targetGib: cache.volume_size_gib,
			volumes,
			update,
			now: Date.now(),
		});
	const isGrowing = isAtomStorageGrowing(growth);
	useEffect(() => setPolling(isGrowing), [isGrowing]);
	useGrowthToasts(growth);
	const hasDisk = Boolean(chartData?.rows.some((row) => row.disk !== null));

	return (
		<>
			<MonitoringChartCard
				title="Storage"
				info={<StorageInfo volumes={volumes} />}
				description={
					cache
						? isGrowing
							? `Growing to ${cache.volume_size_gib} GiB`
							: `${BYOC_CACHE_REPLICAS} × ${cache.volume_size_gib} GiB`
						: undefined
				}
				action={
					isReady && (
						<Button
							variant="secondary"
							size="mini"
							onClick={() => setIncreaseOpen(true)}
							disabled={isGrowing}
						>
							Increase storage
							<PlusIcon className="size-3" />
						</Button>
					)
				}
				notice={growth && <AtomStorageGrowProgress growth={growth} />}
				summary={
					<StorageSummary
						volumes={volumes}
						evictionsTotal={chartData && atomEvictionsTotal(chartData)}
					/>
				}
				isLoading={isLoading}
				isEmpty={!hasDisk}
				emptyLabel={UNAVAILABLE}
				isEmptyCompact
				plotClassName="h-[248px]"
			>
				{chartData && <StoragePlots chartData={chartData} range={range} />}
			</MonitoringChartCard>
			{cache && (
				<IncreaseStorageDialog
					key={cache.volume_size_gib}
					open={isIncreaseOpen}
					onOpenChange={setIncreaseOpen}
					currentGib={cache.volume_size_gib}
					increaseStorage={increaseStorage}
				/>
			)}
		</>
	);
};
