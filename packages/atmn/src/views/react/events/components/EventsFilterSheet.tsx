import { Box, Text } from "ink";
import type { ApiFeature } from "../../../../lib/api/types/index.js";
import type { TimeRangePreset } from "../../../../lib/hooks/useEvents.js";
import type { FilterField } from "../../../../lib/hooks/useEventsFilter.js";
import { DetailSheet, SheetSection } from "../../primitives/index.js";

/**
 * Time range options for the filter
 */
export const TIME_RANGE_OPTIONS: { value: TimeRangePreset; label: string }[] = [
	{ value: "24h", label: "Last 24 hours" },
	{ value: "7d", label: "Last 7 days" },
	{ value: "30d", label: "Last 30 days" },
	{ value: "90d", label: "Last 90 days" },
	{ value: "all", label: "All time" },
];

export interface EventsFilterState {
	/** Customer ID filter (text input) */
	customerId: string;
	/** Selected feature IDs */
	selectedFeatures: string[];
	/** Time range preset */
	timeRange: TimeRangePreset;
	/** Group by property */
	groupBy: string;
}

export { type FilterField } from "../../../../lib/hooks/useEventsFilter.js";

export interface EventsFilterSheetProps {
	/** Current filter state */
	filters: EventsFilterState;
	/** Available features for selection */
	features: ApiFeature[];
	/** Whether the sheet is focused */
	isFocused: boolean;
	/** Currently active field in the filter */
	activeField: FilterField;
	/** Index within the active field (for features list) */
	activeIndex: number;
	/** Whether customer input is being edited */
	isEditingCustomer: boolean;
	/** Whether group by input is being edited */
	isEditingGroupBy: boolean;
	/** Callback to apply filters */
	onApply: () => void;
	/** Callback to clear all filters */
	onClear: () => void;
}

/**
 * Filter panel that replaces the detail sheet when filter mode is active.
 * Allows filtering by customer ID, features, time range, and group by.
 */
export function EventsFilterSheet({
	filters,
	features,
	isFocused,
	activeField,
	activeIndex,
	isEditingCustomer,
	isEditingGroupBy,
}: EventsFilterSheetProps) {
	const getFieldColor = (field: FilterField) => {
		if (!isFocused) return "gray";
		return activeField === field ? "magenta" : "gray";
	};

	const getTimeRangeLabel = (preset: TimeRangePreset) => {
		return TIME_RANGE_OPTIONS.find((o) => o.value === preset)?.label ?? preset;
	};

	// Display group by value without the "properties." prefix
	const displayGroupBy = filters.groupBy
		? filters.groupBy.replace(/^properties\./, "")
		: "";

	return (
		<DetailSheet title="Filters" isFocused={isFocused} minWidth={40}>
			{/* Customer ID Filter */}
			<SheetSection title="Customer ID">
				<Box>
					<Text color={getFieldColor("customer")}>
						{activeField === "customer" && isFocused ? "> " : "  "}
					</Text>
					{isEditingCustomer ? (
						<Text color="cyan">
							{filters.customerId || "(typing...)"}
							<Text color="magenta">|</Text>
						</Text>
					) : (
						<Text color={filters.customerId ? "white" : "gray"}>
							{filters.customerId || "(any)"}
						</Text>
					)}
				</Box>
			</SheetSection>

			{/* Time Range Filter */}
			<SheetSection title="Time Range">
				{TIME_RANGE_OPTIONS.map((option, idx) => {
					const isSelected = filters.timeRange === option.value;
					const isActive =
						activeField === "timeRange" && activeIndex === idx && isFocused;

					return (
						<Box key={option.value}>
							<Text color={isActive ? "magenta" : "gray"}>
								{isActive ? "> " : "  "}
							</Text>
							<Text color={isSelected ? "cyan" : isActive ? "white" : "gray"}>
								{isSelected ? "[x] " : "[ ] "}
								{option.label}
							</Text>
						</Box>
					);
				})}
			</SheetSection>

			{/* Group By Filter */}
			<SheetSection title="Group By">
				{/* None option */}
				<Box>
					<Text color={activeField === "groupBy" && activeIndex === 0 && isFocused ? "magenta" : "gray"}>
						{activeField === "groupBy" && activeIndex === 0 && isFocused ? "> " : "  "}
					</Text>
					<Text color={!filters.groupBy ? "cyan" : activeField === "groupBy" && activeIndex === 0 ? "white" : "gray"}>
						{!filters.groupBy ? "[x] " : "[ ] "}
						None
					</Text>
				</Box>
				{/* Custom input option */}
				<Box>
					<Text color={activeField === "groupBy" && activeIndex === 1 && isFocused ? "magenta" : "gray"}>
						{activeField === "groupBy" && activeIndex === 1 && isFocused ? "> " : "  "}
					</Text>
					{isEditingGroupBy ? (
						<Text color="cyan">
							properties.{displayGroupBy || "(typing...)"}
							<Text color="magenta">|</Text>
						</Text>
					) : filters.groupBy ? (
						<Text color="cyan">
							[x] {filters.groupBy}
						</Text>
					) : (
						<Text color={activeField === "groupBy" && activeIndex === 1 ? "white" : "gray"}>
							[ ] Custom property...
						</Text>
					)}
				</Box>
			</SheetSection>

			{/* Features Filter (multi-select) */}
			<SheetSection title="Features">
				{features.length === 0 ? (
					<Text color="gray">No features available</Text>
				) : (
					features.slice(0, 10).map((feature, idx) => {
						const isSelected = filters.selectedFeatures.includes(feature.id);
						const isActive =
							activeField === "features" && activeIndex === idx && isFocused;

						return (
							<Box key={feature.id}>
								<Text color={isActive ? "magenta" : "gray"}>
									{isActive ? "> " : "  "}
								</Text>
								<Text color={isSelected ? "cyan" : isActive ? "white" : "gray"}>
									{isSelected ? "[x] " : "[ ] "}
									{feature.name || feature.id}
								</Text>
							</Box>
						);
					})
				)}
				{features.length > 10 && (
					<Text color="gray" dimColor>
						  ... and {features.length - 10} more
					</Text>
				)}
			</SheetSection>

			{/* Active Filters Summary */}
			{(filters.customerId ||
				filters.selectedFeatures.length > 0 ||
				filters.timeRange !== "all" ||
				filters.groupBy) && (
				<SheetSection title="Active Filters">
					{filters.customerId && (
						<Text color="cyan">Customer: {filters.customerId}</Text>
					)}
					{filters.timeRange !== "all" && (
						<Text color="cyan">Time: {getTimeRangeLabel(filters.timeRange)}</Text>
					)}
					{filters.groupBy && (
						<Text color="cyan">Group: {filters.groupBy}</Text>
					)}
					{filters.selectedFeatures.length > 0 && (
						<Text color="cyan">
							Features: {filters.selectedFeatures.length} selected
						</Text>
					)}
				</SheetSection>
			)}
		</DetailSheet>
	);
}
