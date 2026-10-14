import { Box, Text, useStdout } from "ink";
import type { FormattedTimeBucket } from "../../../../lib/hooks/useEventsAggregateApi.js";
import type { AggregateBinSize } from "../../../../lib/api/endpoints/events.js";

function useChartDimensions() {
	const { stdout } = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const terminalHeight = stdout?.rows ?? 24;

	const reservedHeight = 19;
	const availableHeight = Math.max(6, terminalHeight - reservedHeight);
	
	const maxBarHeight = Math.min(16, availableHeight);
	
	const reservedWidth = 10;
	const maxBuckets = Math.max(10, Math.min(60, terminalWidth - reservedWidth));

	return { maxBarHeight, maxBuckets };
}

export interface EventsAggregateViewProps {
	data: FormattedTimeBucket[] | undefined;
	totals: Record<string, { count: number; sum: number }> | undefined;
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	requiresCustomer: boolean;
	needsFeatures: boolean;
	binSize: AggregateBinSize;
	isFocused: boolean;
}

const GROUP_COLORS = ["magenta", "blue", "green", "yellow", "cyan", "red"] as const;

function getGroupColor(index: number): typeof GROUP_COLORS[number] {
	return GROUP_COLORS[index % GROUP_COLORS.length] ?? "blue";
}

function hasGroupedData(data: FormattedTimeBucket[]): boolean {
	return data.some((bucket) => Object.keys(bucket.groupedValues).length > 0);
}

function collectAllGroupKeys(data: FormattedTimeBucket[]): string[] {
	const allKeys = new Set<string>();
	for (const bucket of data) {
		for (const groupData of Object.values(bucket.groupedValues)) {
			for (const key of Object.keys(groupData)) {
				allKeys.add(key);
			}
		}
	}
	return Array.from(allKeys).sort();
}

function TimeSeriesChart({
	data,
	maxBarHeight = 8,
	maxBuckets = 20,
}: {
	data: FormattedTimeBucket[];
	maxBarHeight?: number;
	maxBuckets?: number;
}) {
	try {
		if (!data || data.length === 0) {
			return <Text color="gray">No time data available</Text>;
		}

		const buckets = data.slice(-maxBuckets);
		if (buckets.length === 0) {
			return <Text color="gray">No buckets to display</Text>;
		}

		const isGrouped = hasGroupedData(buckets);
		const maxValue = Math.max(...buckets.map((b) => b.totalValue), 1);

		if (isGrouped) {
			return (
				<StackedChart 
					buckets={buckets} 
					maxBarHeight={maxBarHeight} 
					maxValue={maxValue} 
				/>
			);
		}

		const rows: string[] = [];
		for (let row = maxBarHeight - 1; row >= 0; row--) {
			const threshold = (row / maxBarHeight) * maxValue;
			let rowStr = "";
			for (const bucket of buckets) {
				rowStr += bucket.totalValue > threshold ? "█" : " ";
			}
			rows.push(rowStr);
		}

		return (
			<Box flexDirection="column">
				<Box>
					<Text color="gray">{maxValue.toString().padStart(5)} </Text>
					<Text color="gray">{"─".repeat(buckets.length)}</Text>
				</Box>
				{rows.map((row, rowIndex) => (
					<Box key={`row-${maxBarHeight - rowIndex}`}>
						<Text color="gray">{"     "} </Text>
						<Text color="cyan">{row}</Text>
					</Box>
				))}
				<Box>
					<Text color="gray">{"    0"} </Text>
					<Text color="gray">{"─".repeat(buckets.length)}</Text>
				</Box>
				{buckets.length > 0 && (
					<Box>
						<Text color="gray">{"      "}</Text>
						<Text color="gray">{buckets[0]?.label ?? ""}</Text>
						{buckets.length > 1 && (
							<Text color="gray">
								{"".padEnd(Math.max(0, buckets.length - (buckets[0]?.label?.length ?? 0) - (buckets[buckets.length - 1]?.label?.length ?? 0)))}
								{buckets[buckets.length - 1]?.label ?? ""}
							</Text>
						)}
					</Box>
				)}
			</Box>
		);
	} catch (err) {
		console.error("TimeSeriesChart error:", err);
		return <Text color="red">Chart error: {err instanceof Error ? err.message : String(err)}</Text>;
	}
}

function StackedChart({
	buckets,
	maxBarHeight,
	maxValue,
}: {
	buckets: FormattedTimeBucket[];
	maxBarHeight: number;
	maxValue: number;
}) {
	const groupKeys = collectAllGroupKeys(buckets);

	const stackedBuckets = buckets.map((bucket) => {
		const groupTotals: Record<string, number> = {};
		for (const groupData of Object.values(bucket.groupedValues)) {
			for (const [groupKey, val] of Object.entries(groupData)) {
				groupTotals[groupKey] = (groupTotals[groupKey] ?? 0) + val;
			}
		}
		return { ...bucket, groupTotals };
	});

	const rows: Array<{ chars: Array<{ char: string; color: typeof GROUP_COLORS[number] | "gray" }> }> = [];
	
	for (let row = maxBarHeight - 1; row >= 0; row--) {
		const rowThresholdBottom = (row / maxBarHeight) * maxValue;
		const rowThresholdTop = ((row + 1) / maxBarHeight) * maxValue;
		
		const chars: Array<{ char: string; color: typeof GROUP_COLORS[number] | "gray" }> = [];
		
		for (const bucket of stackedBuckets) {
			if (bucket.totalValue <= rowThresholdBottom) {
				chars.push({ char: " ", color: "gray" });
			} else {
				let cumulative = 0;
				let foundColor: typeof GROUP_COLORS[number] | "gray" = "gray";
				
			for (let i = 0; i < groupKeys.length; i++) {
				const groupKey = groupKeys[i];
				if (!groupKey) continue;
				const groupVal = bucket.groupTotals[groupKey] ?? 0;
					const prevCumulative = cumulative;
					cumulative += groupVal;
					
					if (cumulative > rowThresholdBottom && prevCumulative < rowThresholdTop) {
						foundColor = getGroupColor(i);
						break;
					}
				}
				
				chars.push({ char: "█", color: foundColor });
			}
		}
		
		rows.push({ chars });
	}

	return (
		<Box flexDirection="column">
			<Box>
				<Text color="gray">{maxValue.toString().padStart(5)} </Text>
				<Text color="gray">{"─".repeat(buckets.length)}</Text>
			</Box>
			{/* biome-ignore lint/suspicious/noArrayIndexKey: chart cells have no stable ID */}
			{rows.map((row, rowIndex) => (
				<Box key={`row-${maxBarHeight - rowIndex}`}>
					<Text color="gray">{"     "} </Text>
					{row.chars.map((c, charIdx) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: chart cells have no stable ID
						<Text key={`c-${charIdx}`} color={c.color}>{c.char}</Text>
					))}
				</Box>
			))}
			<Box>
				<Text color="gray">{"    0"} </Text>
				<Text color="gray">{"─".repeat(buckets.length)}</Text>
			</Box>
			{buckets.length > 0 && (
				<Box>
					<Text color="gray">{"      "}</Text>
					<Text color="gray">{buckets[0]?.label ?? ""}</Text>
					{buckets.length > 1 && (
						<Text color="gray">
							{"".padEnd(Math.max(0, buckets.length - (buckets[0]?.label?.length ?? 0) - (buckets[buckets.length - 1]?.label?.length ?? 0)))}
							{buckets[buckets.length - 1]?.label ?? ""}
						</Text>
					)}
				</Box>
			)}
			<Box marginTop={1} flexDirection="column">
				<Text color="gray" bold>Groups:</Text>
				{groupKeys.slice(0, 6).map((key, idx) => (
					<Box key={key} gap={1}>
						<Text color={getGroupColor(idx)}>{"█"}</Text>
						<Text color="white">{key}</Text>
					</Box>
				))}
				{groupKeys.length > 6 && (
					<Text color="gray">  ... and {groupKeys.length - 6} more</Text>
				)}
			</Box>
		</Box>
	);
}

function SummaryStats({
	totals,
}: {
	totals: Record<string, { count: number; sum: number }>;
}) {
	try {
		const featureEntries = Object.entries(totals);
		const totalEvents = featureEntries.reduce((sum, [, t]) => sum + t.count, 0);
		const totalValue = featureEntries.reduce((sum, [, t]) => sum + t.sum, 0);

		return (
			<Box gap={3}>
				<Text>
					<Text color="cyan" bold>{totalEvents.toLocaleString()}</Text>
					<Text color="gray"> events</Text>
				</Text>
				<Text>
					<Text color="green" bold>{featureEntries.length}</Text>
					<Text color="gray"> features</Text>
				</Text>
				<Text>
					<Text color="magenta" bold>{totalValue.toLocaleString()}</Text>
					<Text color="gray"> total</Text>
				</Text>
			</Box>
		);
	} catch (err) {
		console.error("SummaryStats error:", err);
		return <Text color="red">Stats error</Text>;
	}
}

export function EventsAggregateView({
	data,
	totals,
	isLoading,
	isError,
	error,
	requiresCustomer,
	needsFeatures,
	binSize,
}: EventsAggregateViewProps) {
	const { maxBarHeight, maxBuckets } = useChartDimensions();

	try {
		if (requiresCustomer) {
			return (
				<Box flexDirection="column" paddingY={1}>
					<Text color="yellow" bold>Customer ID Required</Text>
					<Text color="gray">The aggregate view requires a customer ID to fetch data.</Text>
					<Text color="gray">Press <Text color="cyan">f</Text> to open filters and enter a customer ID.</Text>
				</Box>
			);
		}

		if (needsFeatures) {
			return (
				<Box flexDirection="column" paddingY={1}>
					<Text color="yellow" bold>No Features Available</Text>
					<Text color="gray">Create features or select features in the filter to see aggregate data.</Text>
					<Text color="gray">Press <Text color="cyan">f</Text> to open filters.</Text>
				</Box>
			);
		}

		if (isLoading && !data) {
			return (
				<Box flexDirection="column">
					<Text color="yellow">Loading aggregate data...</Text>
				</Box>
			);
		}

		if (isError && error) {
			return (
				<Box flexDirection="column" paddingY={1}>
					<Text color="red" bold>Error loading aggregate data</Text>
					<Text color="red">{error.message}</Text>
				</Box>
			);
		}

		if (!data || data.length === 0 || !totals) {
			return (
				<Box flexDirection="column">
					<Text color="gray">No aggregate data available.</Text>
					<Text color="gray">Try adjusting the time range or selecting different features.</Text>
				</Box>
			);
		}

		const binLabel = binSize === "hour" ? "Hourly" : binSize === "month" ? "Monthly" : "Daily";
		const isGrouped = hasGroupedData(data);

		return (
			<Box flexDirection="column">
				<SummaryStats totals={totals} />
				<Box marginTop={1} flexDirection="column">
					<Text bold color="gray">{binLabel} Events</Text>
					<TimeSeriesChart data={data} maxBarHeight={maxBarHeight} maxBuckets={maxBuckets} />
				</Box>
				{!isGrouped && (
					<Box marginTop={1} flexDirection="column">
						<Text bold color="gray">By Feature</Text>
						{Object.entries(totals).slice(0, 8).map(([featureId, stats], idx) => (
							<Box key={featureId} gap={1}>
								<Text color={getGroupColor(idx)}>{"█"}</Text>
								<Text color="white">
									{featureId.length > 20 ? `${featureId.slice(0, 18)}..` : featureId.padEnd(20)}
								</Text>
								<Text color="gray">
									{stats.count.toLocaleString()} events, {stats.sum.toLocaleString()} total
								</Text>
							</Box>
						))}
					</Box>
				)}
			</Box>
		);
	} catch (err) {
		console.error("EventsAggregateView error:", err);
		return (
			<Box flexDirection="column" paddingY={1}>
				<Text color="red" bold>Error rendering aggregate view</Text>
				<Text color="red">{err instanceof Error ? err.message : String(err)}</Text>
			</Box>
		);
	}
}
