import { useCallback, useState } from "react";
import type { TimeRangePreset } from "./useEvents.js";

/**
 * Filter state for the events view
 */
export interface EventsFilterState {
	/** Customer ID filter */
	customerId: string;
	/** Selected feature IDs (multi-select) */
	selectedFeatures: string[];
	/** Time range preset */
	timeRange: TimeRangePreset;
	/** Group by property (must start with "properties." or empty for none) */
	groupBy: string;
}

export type FilterField = "customer" | "timeRange" | "features" | "groupBy";

const INITIAL_FILTER_STATE: EventsFilterState = {
	customerId: "",
	selectedFeatures: [],
	timeRange: "all",
	groupBy: "",
};

/**
 * Number of time range options
 */
export const TIME_RANGE_COUNT = 5; // 24h, 7d, 30d, 90d, all

/**
 * Number of groupBy options (None + custom input)
 */
export const GROUP_BY_COUNT = 2;

/**
 * Hook for managing events filter state and navigation
 */
export function useEventsFilter(featuresCount: number) {
	// Applied filters (what's actually being used for querying)
	const [appliedFilters, setAppliedFilters] =
		useState<EventsFilterState>(INITIAL_FILTER_STATE);

	// Draft filters (what's being edited in the filter panel)
	const [draftFilters, setDraftFilters] =
		useState<EventsFilterState>(INITIAL_FILTER_STATE);

	// Filter panel state
	const [isFilterOpen, setIsFilterOpen] = useState(false);
	const [activeField, setActiveField] = useState<FilterField>("timeRange");
	const [activeIndex, setActiveIndex] = useState(0);
	const [isEditingCustomer, setIsEditingCustomer] = useState(false);
	const [isEditingGroupBy, setIsEditingGroupBy] = useState(false);

	// Open filter panel
	const openFilter = useCallback(() => {
		setDraftFilters(appliedFilters); // Copy applied filters to draft
		setIsFilterOpen(true);
		setActiveField("timeRange");
		setActiveIndex(
			appliedFilters.timeRange === "all"
				? 4
				: ["24h", "7d", "30d", "90d"].indexOf(appliedFilters.timeRange),
		);
	}, [appliedFilters]);

	// Close filter panel (discard changes)
	const closeFilter = useCallback(() => {
		setIsFilterOpen(false);
		setIsEditingCustomer(false);
		setIsEditingGroupBy(false);
	}, []);

	// Apply filters
	const applyFilters = useCallback(() => {
		setAppliedFilters(draftFilters);
		setIsFilterOpen(false);
		setIsEditingCustomer(false);
		setIsEditingGroupBy(false);
	}, [draftFilters]);

	// Clear all filters
	const clearFilters = useCallback(() => {
		setDraftFilters(INITIAL_FILTER_STATE);
		setAppliedFilters(INITIAL_FILTER_STATE);
	}, []);

	// Navigate between fields (Tab)
	const nextField = useCallback(() => {
		if (isEditingCustomer) {
			setIsEditingCustomer(false);
		}
		if (isEditingGroupBy) {
			setIsEditingGroupBy(false);
		}

		const fields: FilterField[] = ["customer", "timeRange", "groupBy", "features"];
		const currentIdx = fields.indexOf(activeField);
		const nextIdx = (currentIdx + 1) % fields.length;
		setActiveField(fields[nextIdx]!);
		setActiveIndex(0);
	}, [activeField, isEditingCustomer, isEditingGroupBy]);

	const prevField = useCallback(() => {
		if (isEditingCustomer) {
			setIsEditingCustomer(false);
		}
		if (isEditingGroupBy) {
			setIsEditingGroupBy(false);
		}

		const fields: FilterField[] = ["customer", "timeRange", "groupBy", "features"];
		const currentIdx = fields.indexOf(activeField);
		const prevIdx = (currentIdx - 1 + fields.length) % fields.length;
		setActiveField(fields[prevIdx]!);
		setActiveIndex(0);
	}, [activeField, isEditingCustomer, isEditingGroupBy]);

	// Navigate within field (up/down arrows)
	const moveUp = useCallback(() => {
		if (activeField === "customer") return;

		let maxIndex: number;
		if (activeField === "timeRange") {
			maxIndex = TIME_RANGE_COUNT - 1;
		} else if (activeField === "groupBy") {
			maxIndex = GROUP_BY_COUNT - 1;
		} else {
			maxIndex = Math.min(featuresCount - 1, 9);
		}

		setActiveIndex((prev) => Math.max(0, prev - 1));
	}, [activeField, featuresCount]);

	const moveDown = useCallback(() => {
		if (activeField === "customer") return;

		let maxIndex: number;
		if (activeField === "timeRange") {
			maxIndex = TIME_RANGE_COUNT - 1;
		} else if (activeField === "groupBy") {
			maxIndex = GROUP_BY_COUNT - 1;
		} else {
			maxIndex = Math.min(featuresCount - 1, 9);
		}

		setActiveIndex((prev) => Math.min(maxIndex, prev + 1));
	}, [activeField, featuresCount]);

	// Toggle selection (Space/Enter on features, time range, or groupBy)
	const toggleSelection = useCallback(
		(features: { id: string }[]) => {
			if (activeField === "customer") {
				setIsEditingCustomer(true);
				return;
			}

		if (activeField === "timeRange") {
			const presets: TimeRangePreset[] = ["24h", "7d", "30d", "90d", "all"];
			setDraftFilters((prev) => ({
				...prev,
				timeRange: presets[activeIndex] ?? "24h",
			}));
				return;
			}

			if (activeField === "groupBy") {
				if (activeIndex === 0) {
					// None selected
					setDraftFilters((prev) => ({
						...prev,
						groupBy: "",
					}));
				} else {
					// Custom input
					setIsEditingGroupBy(true);
				}
				return;
			}

			if (activeField === "features") {
				const feature = features[activeIndex];
				if (!feature) return;

				setDraftFilters((prev) => {
					const isSelected = prev.selectedFeatures.includes(feature.id);
					return {
						...prev,
						selectedFeatures: isSelected
							? prev.selectedFeatures.filter((id) => id !== feature.id)
							: [...prev.selectedFeatures, feature.id],
					};
				});
			}
		},
		[activeField, activeIndex],
	);

	// Update customer ID (when editing)
	const setCustomerId = useCallback((value: string) => {
		setDraftFilters((prev) => ({
			...prev,
			customerId: value,
		}));
	}, []);

	// Finish editing customer ID
	const finishEditingCustomer = useCallback(() => {
		setIsEditingCustomer(false);
	}, []);

	// Update group by (when editing)
	const setGroupBy = useCallback((value: string) => {
		// Auto-prefix with "properties." if user doesn't include it
		const prefixedValue =
			value && !value.startsWith("properties.") ? `properties.${value}` : value;
		setDraftFilters((prev) => ({
			...prev,
			groupBy: prefixedValue,
		}));
	}, []);

	// Finish editing group by
	const finishEditingGroupBy = useCallback(() => {
		setIsEditingGroupBy(false);
	}, []);

	// Check if any filters are active
	const hasActiveFilters =
		appliedFilters.customerId !== "" ||
		appliedFilters.selectedFeatures.length > 0 ||
		appliedFilters.timeRange !== "all" ||
		appliedFilters.groupBy !== "";

	return {
		// Applied filters (for data fetching)
		appliedFilters,

		// Draft filters (for editing)
		draftFilters,

		// Panel state
		isFilterOpen,
		activeField,
		activeIndex,
		isEditingCustomer,
		isEditingGroupBy,
		hasActiveFilters,

		// Actions
		openFilter,
		closeFilter,
		applyFilters,
		clearFilters,
		nextField,
		prevField,
		moveUp,
		moveDown,
		toggleSelection,
		setCustomerId,
		finishEditingCustomer,
		setGroupBy,
		finishEditingGroupBy,
	};
}
