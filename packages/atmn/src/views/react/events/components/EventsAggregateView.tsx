import { Box, Text, useStdout } from "ink";
import type { FormattedTimeBucket } from "../../../../lib/hooks/useEventsAggregateApi.js";
import type { AggregateBinSize } from "../../../../lib/api/endpoints/events.js";

/**
 * Calculate chart dimensions based on terminal size
 */
function useChartDimensions() {
	const { stdout } = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const terminalHeight = stdout?.rows ?? 24;

	// Reserve space for: title bar (2), summary stats (1), chart title (1), 
	// x-axis labels (2), "By Feature" section header (1), feature rows (up to 8), 
	// keyboard hints (2), margins (2)
	const reservedHeight = 19;
	const availableHeight = Math.max(6, terminalHeight - reservedHeight);
	
	// Chart height: use most of available space, cap at 16 for readability
	const maxBarHeight = Math.min(16, availableHeight);
	
	// Chart width: reserve space for y-axis label (6 chars) and some margin
	// Each bucket is 1 char wide
	const reservedWidth = 10;
	const maxBuckets = Math.max(10, Math.min(60, terminalWidth - reservedWidth));

	return { maxBarHeight, maxBuckets };
}

export interface EventsAggregateViewProps {
	/** Formatted time bucket data from API */
	data: FormattedTimeBucket[] | undefined;
	/** Totals per feature */
	totals: Record<string, { count: number; sum: number }> | undefined;
	/** Whether data is loading */
	isLoading: boolean;
	/** Whether there's an error */
	isError: boolean;
	/** Error message */
	error: Error | null;
	/** Whether customer ID is required but not provided */
	requiresCustomer: boolean;
	/** Whether features are needed but not available */
	needsFeatures: boolean;
	/** Current bin size for display */
	binSize: AggregateBinSize;
	/** Whether this view is focused */
	isFocused: boolean;
}

/**
 * Colors for different groups/features in charts
 */
const GROUP_COLORS = ["magenta", "blue", "green", "yellow", "cyan", "red"] as const;

/**
 * Get color for a group/feature index
 */
function getGroupColor(index: number): typeof GROUP_COLORS[number] {
	return GROUP_COLORS[index % GROUP_COLORS.length] ?? "blue";
}

/**
 * Check if data has grouped values (i.e., groupBy was used)
 */
function hasGroupedData(data: FormattedTimeBucket[]): boolean {
	return data.some((bucket) => Object.keys(bucket.groupedValues).length > 0);
}

/**
 * Collect all unique group keys across all buckets
 */
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

/**
 * ASCII time-series bar chart component
 * Supports stacked bars when groupBy data is present
 */
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

		// Simple (non-stacked) chart
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

/**
 * Stacked bar chart component with colored groups
 */
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

	// Pre-calculate stacked data for each bucket
	const stackedBuckets = buckets.map((bucket) => {
		const groupTotals: Record<string, number> = {};
		for (const groupData of Object.values(bucket.groupedValues)) {
			for (const [groupKey, val] of Object.entries(groupData)) {
				groupTotals[groupKey] = (groupTotals[groupKey] ?? 0) + val;
			}
		}
		return { ...bucket, groupTotals };
	});

	// Render rows from top to bottom
	const rows: Array<{ chars: Array<{ char: string; color: typeof GROUP_COLORS[number] | "gray" }> }> = [];
	
	for (let row = maxBarHeight - 1; row >= 0; row--) {
		const rowThresholdBottom = (row / maxBarHeight) * maxValue;
		const rowThresholdTop = ((row + 1) / maxBarHeight) * maxValue;
		
		const chars: Array<{ char: string; color: typeof GROUP_COLORS[number] | "gray" }> = [];
		
		for (const bucket of stackedBuckets) {
			if (bucket.totalValue <= rowThresholdBottom) {
				chars.push({ char: " ", color: "gray" });
			} else {
				// Find which group is at this height
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
			{/* Legend */}
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

/**
 * Summary stats display
 */
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

/**
 * Aggregate view with time-series chart
 */
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
	// Call hooks unconditionally at the top
	const { maxBarHeight, maxBuckets } = useChartDimensions();

	try {
		// Customer ID required
		if (requiresCustomer) {
			return (
				<Box flexDirection="column" paddingY={1}>
					<Text color="yellow" bold>Customer ID Required</Text>
					<Text color="gray">The aggregate view requires a customer ID to fetch data.</Text>
					<Text color="gray">Press <Text color="cyan">f</Text> to open filters and enter a customer ID.</Text>
				</Box>
			);
		}

		// No features available
		if (needsFeatures) {
			return (
				<Box flexDirection="column" paddingY={1}>
					<Text color="yellow" bold>No Features Available</Text>
					<Text color="gray">Create features or select features in the filter to see aggregate data.</Text>
					<Text color="gray">Press <Text color="cyan">f</Text> to open filters.</Text>
				</Box>
			);
		}

		// Loading state
		if (isLoading && !data) {
			return (
				<Box flexDirection="column">
					<Text color="yellow">Loading aggregate data...</Text>
				</Box>
			);
		}

		// Error state - THIS IS THE KEY PART
		if (isError && error) {
			return (
				<Box flexDirection="column" paddingY={1}>
					<Text color="red" bold>Error loading aggregate data</Text>
					<Text color="red">{error.message}</Text>
				</Box>
			);
		}

		// Empty state
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
				{/* Only show "By Feature" when not grouped (stacked chart shows its own legend) */}
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
