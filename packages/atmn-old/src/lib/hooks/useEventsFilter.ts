import { useCallback, useState } from "react";
import type { TimeRangePreset } from "./useEvents.js";

export interface EventsFilterState {
	customerId: string;
	selectedFeatures: string[];
	timeRange: TimeRangePreset;
	groupBy: string;
}

export type FilterField = "customer" | "timeRange" | "features" | "groupBy";

const INITIAL_FILTER_STATE: EventsFilterState = {
	customerId: "",
	selectedFeatures: [],
	timeRange: "all",
	groupBy: "",
};

export const TIME_RANGE_COUNT = 5;
export const GROUP_BY_COUNT = 2;

export function useEventsFilter(featuresCount: number) {
	const [appliedFilters, setAppliedFilters] =
		useState<EventsFilterState>(INITIAL_FILTER_STATE);

	const [draftFilters, setDraftFilters] =
		useState<EventsFilterState>(INITIAL_FILTER_STATE);

	const [isFilterOpen, setIsFilterOpen] = useState(false);
	const [activeField, setActiveField] = useState<FilterField>("timeRange");
	const [activeIndex, setActiveIndex] = useState(0);
	const [isEditingCustomer, setIsEditingCustomer] = useState(false);
	const [isEditingGroupBy, setIsEditingGroupBy] = useState(false);

	const openFilter = useCallback(() => {
		setDraftFilters(appliedFilters);
		setIsFilterOpen(true);
		setActiveField("timeRange");
		setActiveIndex(
			appliedFilters.timeRange === "all"
				? 4
				: ["24h", "7d", "30d", "90d"].indexOf(appliedFilters.timeRange),
		);
	}, [appliedFilters]);

	const closeFilter = useCallback(() => {
		setIsFilterOpen(false);
		setIsEditingCustomer(false);
		setIsEditingGroupBy(false);
	}, []);

	const applyFilters = useCallback(() => {
		setAppliedFilters(draftFilters);
		setIsFilterOpen(false);
		setIsEditingCustomer(false);
		setIsEditingGroupBy(false);
	}, [draftFilters]);

	const clearFilters = useCallback(() => {
		setDraftFilters(INITIAL_FILTER_STATE);
		setAppliedFilters(INITIAL_FILTER_STATE);
	}, []);

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
					setDraftFilters((prev) => ({
						...prev,
						groupBy: "",
					}));
				} else {
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

	const setCustomerId = useCallback((value: string) => {
		setDraftFilters((prev) => ({
			...prev,
			customerId: value,
		}));
	}, []);

	const finishEditingCustomer = useCallback(() => {
		setIsEditingCustomer(false);
	}, []);

	const setGroupBy = useCallback((value: string) => {
		const prefixedValue =
			value && !value.startsWith("properties.") ? `properties.${value}` : value;
		setDraftFilters((prev) => ({
			...prev,
			groupBy: prefixedValue,
		}));
	}, []);

	const finishEditingGroupBy = useCallback(() => {
		setIsEditingGroupBy(false);
	}, []);

	const hasActiveFilters =
		appliedFilters.customerId !== "" ||
		appliedFilters.selectedFeatures.length > 0 ||
		appliedFilters.timeRange !== "all" ||
		appliedFilters.groupBy !== "";

	return {
		appliedFilters,

		draftFilters,

		isFilterOpen,
		activeField,
		activeIndex,
		isEditingCustomer,
		isEditingGroupBy,
		hasActiveFilters,

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
