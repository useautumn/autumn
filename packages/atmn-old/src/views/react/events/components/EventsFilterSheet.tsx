import { Box, Text } from "ink";
import type { ApiFeature } from "../../../../lib/api/types/index.js";
import type { TimeRangePreset } from "../../../../lib/hooks/useEvents.js";
import type { FilterField } from "../../../../lib/hooks/useEventsFilter.js";
import { DetailSheet, SheetSection } from "../../primitives/index.js";

export const TIME_RANGE_OPTIONS: { value: TimeRangePreset; label: string }[] = [
	{ value: "24h", label: "Last 24 hours" },
	{ value: "7d", label: "Last 7 days" },
	{ value: "30d", label: "Last 30 days" },
	{ value: "90d", label: "Last 90 days" },
	{ value: "all", label: "All time" },
];

export interface EventsFilterState {
	customerId: string;
	selectedFeatures: string[];
	timeRange: TimeRangePreset;
	groupBy: string;
}

export { type FilterField } from "../../../../lib/hooks/useEventsFilter.js";

export interface EventsFilterSheetProps {
	filters: EventsFilterState;
	features: ApiFeature[];
	isFocused: boolean;
	activeField: FilterField;
	activeIndex: number;
	isEditingCustomer: boolean;
	isEditingGroupBy: boolean;
	onApply: () => void;
	onClear: () => void;
}

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

	const displayGroupBy = filters.groupBy
		? filters.groupBy.replace(/^properties\./, "")
		: "";

	return (
		<DetailSheet title="Filters" isFocused={isFocused} minWidth={40}>
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

			<SheetSection title="Group By">
				<Box>
					<Text color={activeField === "groupBy" && activeIndex === 0 && isFocused ? "magenta" : "gray"}>
						{activeField === "groupBy" && activeIndex === 0 && isFocused ? "> " : "  "}
					</Text>
					<Text color={!filters.groupBy ? "cyan" : activeField === "groupBy" && activeIndex === 0 ? "white" : "gray"}>
						{!filters.groupBy ? "[x] " : "[ ] "}
						None
					</Text>
				</Box>
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
