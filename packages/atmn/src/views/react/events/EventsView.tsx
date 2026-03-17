import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ApiFeature } from "../../../lib/api/types/index.js";
import { AppEnv } from "../../../lib/env/detect.js";
import { APP_VERSION } from "../../../lib/version.js";
import { useClipboard } from "../../../lib/hooks/useClipboard.js";
import {
	useEvents,
	type ApiEventsListItem,
	type TimeRangePreset,
} from "../../../lib/hooks/useEvents.js";
import {
	useEventsAggregateApi,
	type UITimeRange,
} from "../../../lib/hooks/useEventsAggregateApi.js";
import { useEventsFilter } from "../../../lib/hooks/useEventsFilter.js";
import { useFeatures } from "../../../lib/hooks/useFeatures.js";
import { useListNavigation } from "../../../lib/hooks/useListNavigation.js";
import {
	DataTable,
	ListViewLayout,
	SplitPane,
	formatDate,
	getPaginationDisplay,
	type Column,
	type KeybindHint,
	type ListViewState,
	type TitleBarItem,
} from "../primitives/index.js";
import {
	EventSheet,
	EventsAggregateView,
	EventsFilterSheet,
	TIME_RANGE_OPTIONS,
} from "./components/index.js";

/**
 * Error boundary fallback component for EventsView
 */
function EventsViewError({ error, onRetry }: { error: Error; onRetry?: () => void }) {
	return (
		<Box flexDirection="column" padding={1}>
			<Text color="red" bold>EventsView Error</Text>
			<Text color="red">{error?.message ?? "An unknown error occurred"}</Text>
			{onRetry && (
				<Text color="gray" dimColor>Press 'r' to retry</Text>
			)}
		</Box>
	);
}

const PAGE_SIZE = 50;

/**
 * View mode for the events display
 */
export type ViewMode = "list" | "aggregate";

import type { AggregateBinSize } from "../../../lib/api/endpoints/events.js";

/**
 * Bin size options for aggregate view
 */
const BIN_SIZE_OPTIONS: { value: AggregateBinSize; label: string }[] = [
	{ value: "hour", label: "Hourly" },
	{ value: "day", label: "Daily" },
	{ value: "month", label: "Monthly" },
];

// Column definitions for the DataTable (with defensive null checks)
// Note: Don't pre-truncate in render - let DataTable handle truncation dynamically based on available width
const columns: Column<ApiEventsListItem>[] = [
	{
		key: "id",
		header: "ID",
		render: (e) => e?.id ?? "",
		minWidth: 20,
	},
	{
		key: "timestamp",
		header: "Time",
		render: (e) => formatDate(e?.timestamp ?? ""),
		minWidth: 14,
	},
	{
		key: "customer",
		header: "Customer",
		render: (e) => e?.customer_id ?? "",
		minWidth: 16,
	},
	{
		key: "feature",
		header: "Feature",
		render: (e) => e?.feature_id ?? "",
		minWidth: 10,
	},
	{
		key: "value",
		header: "Value",
		render: (e) => String(e?.value ?? ""),
		minWidth: 6,
	},
];

// Generate keyboard hints based on current state
const getHints = (
	viewMode: ViewMode,
	focusTarget: "table" | "sheet" | "search",
	sheetOpen: boolean,
	filterOpen: boolean,
	canGoPrev: boolean,
	canGoNext: boolean,
	hasActiveFilters: boolean,
): KeybindHint[] => {
	// Filter panel is open
	if (filterOpen) {
		return [
			{ key: "↑/↓", label: "navigate" },
			{ key: "Tab", label: "next field" },
			{ key: "Space", label: "toggle" },
			{ key: "Enter", label: "apply" },
			{ key: "x", label: "clear all" },
			{ key: "Esc", label: "close" },
		];
	}

	// Aggregate view
	if (viewMode === "aggregate") {
		return [
			{ key: "v", label: "list view" },
			{ key: "g", label: "time grouping" },
			{ key: "f", label: hasActiveFilters ? "filter *" : "filter" },
			{ key: "r", label: "refresh" },
			{ key: "q", label: "quit" },
		];
	}

	// Detail sheet is focused
	if (focusTarget === "sheet" && sheetOpen) {
		return [
			{ key: "Tab", label: "focus table" },
			{ key: "Esc", label: "close" },
			{ key: "c", label: "copy ID" },
			{ key: "v", label: "aggregate" },
			{ key: "f", label: "filter" },
			{ key: "q", label: "quit" },
		];
	}

	// Table is focused (list view)
	return [
		{ key: "↑/↓", label: "navigate" },
		{ key: "n", label: "next page", visible: canGoNext },
		{ key: "p", label: "prev page", visible: canGoPrev },
		{ key: "Enter", label: "inspect" },
		{ key: "v", label: "aggregate" },
		{ key: "f", label: hasActiveFilters ? "filter *" : "filter" },
		{ key: "r", label: "refresh" },
		{ key: "q", label: "quit" },
	];
};

// Get display label for time range
const getTimeRangeLabel = (preset: TimeRangePreset): string => {
	return TIME_RANGE_OPTIONS.find((o) => o.value === preset)?.label ?? preset;
};

export interface EventsViewProps {
	environment?: AppEnv;
	/** Filter by customer ID (passed from CLI --customer option) */
	customerId?: string;
	/** Filter by feature ID (passed from CLI --feature option) */
	featureId?: string;
	/** Called when user exits (q or ctrl+c) - use to clear terminal */
	onExit?: () => void;
}

/**
 * Main events view orchestrator with filter panel and aggregate view support
 */
export function EventsView({
	environment = AppEnv.Sandbox,
	customerId: cliCustomerId,
	featureId: cliFeatureId,
	onExit,
}: EventsViewProps) {
	const { exit } = useApp();
	const { copy, showingFeedback } = useClipboard();
	
	// Component-level error state
	const [componentError, setComponentError] = useState<Error | null>(null);

	// View mode state
	const [viewMode, setViewMode] = useState<ViewMode>("list");
	const [binSize, setBinSize] = useState<AggregateBinSize>("day");

	// Fetch features for filter dropdown
	const { data: featuresData } = useFeatures({ environment });
	const features: ApiFeature[] = featuresData ?? [];

	// Filter state management
	const {
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
		moveUp: filterMoveUp,
		moveDown: filterMoveDown,
		toggleSelection,
		setCustomerId,
		finishEditingCustomer,
		setGroupBy,
		finishEditingGroupBy,
	} = useEventsFilter(features.length);

	// List navigation state
	const {
		state,
		moveUp,
		moveDown,
		nextPage,
		prevPage,
		openSheet,
		closeSheet,
		toggleFocus,
		selectItem,
		resetPage,
	} = useListNavigation<ApiEventsListItem>();

	// Combine CLI filters with UI filters
	const effectiveCustomerId = appliedFilters.customerId || cliCustomerId;
	const effectiveFeatureId =
		appliedFilters.selectedFeatures.length > 0
			? appliedFilters.selectedFeatures
			: cliFeatureId;

	// Fetch events for list view
	const { data, isLoading, isError, error, refetch, isFetching } = useEvents({
		page: state.page,
		pageSize: PAGE_SIZE,
		environment,
		customerId: effectiveCustomerId,
		featureId: effectiveFeatureId,
		timeRange: appliedFilters.timeRange,
	});

	const events = data?.list ?? [];
	const hasMore = data?.has_more ?? false;
	const pagination = getPaginationDisplay(
		state.page,
		events.length,
		PAGE_SIZE,
		hasMore,
	);

	// Map time range for aggregate API (it doesn't support "all", use "90d" instead)
	const aggregateTimeRange: UITimeRange = appliedFilters.timeRange === "all" 
		? "90d" 
		: (appliedFilters.timeRange as UITimeRange);

	// Get feature IDs for aggregate - use selected features or all available features
	const aggregateFeatureIds: string[] = effectiveFeatureId
		? (Array.isArray(effectiveFeatureId) ? effectiveFeatureId : [effectiveFeatureId])
		: (features ?? []).map((f) => f.id);

	// Aggregate data from external API (REQUIRES customer_id and feature_id)
	const aggregateResult = useEventsAggregateApi({
		environment,
		customerId: effectiveCustomerId,
		featureId: aggregateFeatureIds,
		timeRange: aggregateTimeRange,
		binSize,
		groupBy: appliedFilters.groupBy || undefined,
		enabled: viewMode === "aggregate" && !!effectiveCustomerId && aggregateFeatureIds.length > 0,
	});

	// Check if aggregate view needs customer ID
	const aggregateRequiresCustomer = viewMode === "aggregate" && !effectiveCustomerId;
	// Check if aggregate view needs features but doesn't have any
	const aggregateNeedsFeatures = viewMode === "aggregate" && !aggregateRequiresCustomer && aggregateFeatureIds.length === 0;

	// Track previous filter state to detect changes
	const prevFilterRef = useRef<string | null>(null);
	const filterKey = `${appliedFilters.customerId}|${appliedFilters.selectedFeatures.join(",")}|${appliedFilters.timeRange}`;

	// Reset to page 1 when filters change
	useEffect(() => {
		if (prevFilterRef.current !== null && prevFilterRef.current !== filterKey) {
			resetPage();
		}
		prevFilterRef.current = filterKey;
	}, [filterKey, resetPage]);

	// Toggle view mode
	const toggleViewMode = useCallback(() => {
		try {
			setViewMode((prev) => (prev === "list" ? "aggregate" : "list"));
		} catch (err) {
			console.error("[EventsView] Error toggling view mode:", err);
			setComponentError(err instanceof Error ? err : new Error(String(err)));
		}
	}, []);

	// Cycle bin size for aggregate view
	const cycleBinSize = useCallback(() => {
		try {
			setBinSize((prev) => {
				const currentIdx = BIN_SIZE_OPTIONS.findIndex((t) => t.value === prev);
				const nextIdx = (currentIdx + 1) % BIN_SIZE_OPTIONS.length;
				return BIN_SIZE_OPTIONS[nextIdx]?.value ?? "day";
			});
		} catch (err) {
			console.error("[EventsView] Error cycling bin size:", err);
			setComponentError(err instanceof Error ? err : new Error(String(err)));
		}
	}, []);

	// Handle keyboard input
	useInput(
		useCallback(
			(input, key) => {
				try {
					// === FILTER PANEL CONTROLS ===
					if (isFilterOpen) {
						// Handle customer ID text input
						if (isEditingCustomer) {
							if (key.escape) {
								finishEditingCustomer();
								return;
							}
							if (key.return) {
								finishEditingCustomer();
								return;
							}
							// Let TextInput handle other keys
							return;
						}

						// Handle group by text input
						if (isEditingGroupBy) {
							if (key.escape) {
								finishEditingGroupBy();
								return;
							}
							if (key.return) {
								finishEditingGroupBy();
								return;
							}
							// Let TextInput handle other keys
							return;
						}

						// Close filter panel
						if (key.escape) {
							closeFilter();
							return;
						}

						// Apply filters
						if (key.return) {
							applyFilters();
							return;
						}

						// Clear all filters
						if (input === "x") {
							clearFilters();
							return;
						}

						// Navigate between fields
						if (key.tab) {
							nextField();
							return;
						}

						// Navigate within field
						if (key.upArrow || input === "k") {
							filterMoveUp();
							return;
						}
						if (key.downArrow || input === "j") {
							filterMoveDown();
							return;
						}

						// Toggle selection
						if (input === " ") {
							toggleSelection(features ?? []);
							return;
						}

						return;
					}

					// === GLOBAL CONTROLS ===

					// Quit
					if (input === "q") {
						if (onExit) {
							onExit();
						} else {
							exit();
						}
						return;
					}

					// Toggle view mode
					if (input === "v") {
						toggleViewMode();
						return;
					}

					// Open filter panel
					if (input === "f") {
						openFilter();
						return;
					}

					// Refresh
					if (input === "r") {
						refetch();
						return;
					}

					// === AGGREGATE VIEW CONTROLS ===
					if (viewMode === "aggregate") {
						// Cycle bin size
						if (input === "g") {
							cycleBinSize();
							return;
						}
						return;
					}

					// === DETAIL SHEET CONTROLS ===
					if (state?.focusTarget === "sheet" && state?.sheetOpen) {
						// Copy ID
						if (input === "c" && state?.selectedItem?.id) {
							copy(state.selectedItem.id);
							return;
						}

						// Close sheet
						if (key.escape) {
							closeSheet();
							return;
						}

						// Toggle focus to table
						if (key.tab) {
							toggleFocus();
							return;
						}

						return;
					}

					// === TABLE CONTROLS (LIST VIEW) ===
					if (state?.focusTarget === "table") {
						// Navigate up
						if (key.upArrow || input === "k") {
							moveUp();
							return;
						}

						// Navigate down
						if (key.downArrow || input === "j") {
							const maxIndex = (events?.length ?? 1) - 1;
							moveDown(maxIndex >= 0 ? maxIndex : 0);
							return;
						}

						// Previous page (p or left arrow)
						if ((input === "p" || key.leftArrow) && pagination?.canGoPrev) {
							prevPage();
							return;
						}

						// Next page (n or right arrow)
						if ((input === "n" || key.rightArrow) && pagination?.canGoNext) {
							nextPage(pagination.canGoNext);
							return;
						}

						// Open sheet
						if (key.return) {
							const event = events?.[state?.selectedIndex ?? 0];
							if (event) {
								openSheet(event);
							}
							return;
						}

						// Toggle focus to sheet (if open)
						if (key.tab && state?.sheetOpen) {
							toggleFocus();
							return;
						}
					}
				} catch (err) {
					console.error("[EventsView] Error handling input:", err);
					setComponentError(err instanceof Error ? err : new Error(String(err)));
				}
			},
			[
				isFilterOpen,
				isEditingCustomer,
				isEditingGroupBy,
				viewMode,
				state,
				events,
				features,
				pagination,
				exit,
				onExit,
				refetch,
				copy,
				closeSheet,
				toggleFocus,
				moveUp,
				moveDown,
				prevPage,
				nextPage,
				openSheet,
				openFilter,
				closeFilter,
				applyFilters,
				clearFilters,
				nextField,
				filterMoveUp,
				filterMoveDown,
				toggleSelection,
				finishEditingCustomer,
				finishEditingGroupBy,
				toggleViewMode,
				cycleBinSize,
			],
		),
	);

	// Sync selected event when events load
	useEffect(() => {
		if (events.length > 0 && state.selectedIndex < events.length) {
			const event = events[state.selectedIndex];
			if (event) {
				selectItem(event, state.selectedIndex);
			}
		}
	}, [events, state.selectedIndex, selectItem]);

	// Determine view state for ListViewLayout
	const getViewState = (): ListViewState => {
		try {
			if (isLoading && !data) return "loading";
			if (isError && error) return "error";
			if (!events?.length && !isFetching) return "empty";
			return "data";
		} catch (err) {
			console.error("[EventsView] Error getting view state:", err);
			return "error";
		}
	};

	// Build filter description for empty state and title bar
	const getFilterDescription = () => {
		try {
			const filters: string[] = [];
			if (effectiveCustomerId) filters.push(`customer: ${effectiveCustomerId}`);
			if (effectiveFeatureId) {
				const featureIds = Array.isArray(effectiveFeatureId)
					? effectiveFeatureId
					: [effectiveFeatureId];
				filters.push(
					`feature${featureIds.length > 1 ? "s" : ""}: ${featureIds.join(", ")}`,
				);
			}
			if (appliedFilters?.timeRange && appliedFilters.timeRange !== "all") {
				filters.push(`time: ${getTimeRangeLabel(appliedFilters.timeRange)}`);
			}
			return filters.length > 0 ? `Filters: ${filters.join(", ")}` : "";
		} catch (err) {
			console.error("[EventsView] Error getting filter description:", err);
			return "";
		}
	};

	// Build title bar items showing view mode and filters
	const titleBarItems: TitleBarItem[] = [];

	// Show view mode
	titleBarItems.push({
		label: "View",
		value: viewMode === "aggregate" ? "Aggregate" : "List",
		color: viewMode === "aggregate" ? "yellow" : "white",
	});

	// Show bin size in aggregate mode
	if (viewMode === "aggregate") {
		const binSizeLabel =
			BIN_SIZE_OPTIONS.find((t) => t.value === binSize)?.label ?? binSize;
		titleBarItems.push({
			label: "Bin",
			value: binSizeLabel,
			color: "cyan",
		});
	}

	// Show filter indicator
	if (hasActiveFilters || cliCustomerId || cliFeatureId) {
		titleBarItems.push({
			label: "Filter",
			value: "active",
			color: "cyan",
		});
	}

	// Determine if side panel should show filter or detail sheet
	const showFilterPanel = isFilterOpen;
	const showDetailSheet =
		state.sheetOpen && !!state.selectedItem && !isFilterOpen && viewMode === "list";
	const sideOpen = showFilterPanel || showDetailSheet;

	// Pagination text for aggregate mode
	const getAggregatePaginationText = () => {
		try {
			if (viewMode !== "aggregate") return pagination?.text ?? "";
			if (aggregateNeedsFeatures) return "No features to aggregate";
			if (aggregateResult?.isLoading) return "Loading...";
			if (aggregateResult?.totals) {
				const totalsValues = Object.values(aggregateResult.totals);
				const totalEvents = totalsValues.reduce(
					(sum, t) => sum + (t?.sum ?? 0),
					0,
				);
				return `${totalEvents.toLocaleString()} total`;
			}
			return "No data";
		} catch (err) {
			console.error("[EventsView] Error getting pagination text:", err);
			return "Error";
		}
	};

	// Show error state if component has caught an error
	if (componentError) {
		return (
			<EventsViewError 
				error={componentError} 
				onRetry={() => {
					setComponentError(null);
					refetch();
				}} 
			/>
		);
	}

	// Wrap render in try-catch for safety
	try {
		return (
			<ListViewLayout
				viewState={getViewState()}
				commandName="atmn events"
				version={APP_VERSION}
				paginationText={getAggregatePaginationText()}
				titleBarItems={titleBarItems}
				hints={getHints(
					viewMode,
					state?.focusTarget ?? "table",
					state?.sheetOpen ?? false,
					isFilterOpen,
					pagination?.canGoPrev ?? false,
					pagination?.canGoNext ?? false,
					hasActiveFilters,
				)}
				loadingMessage={`Loading ${environment === AppEnv.Live ? "live" : "sandbox"} events...`}
				error={error as Error}
				onRetry={refetch}
				emptyTitle="No events found"
				emptyDescription={
					getFilterDescription() ||
					"Events are created when you track usage via the API"
				}
			>
				<SplitPane
					main={
						viewMode === "aggregate" ? (
							<EventsAggregateView
								data={aggregateResult?.data}
								totals={aggregateResult?.totals}
								isLoading={aggregateResult?.isLoading ?? false}
								isError={aggregateResult?.isError ?? false}
								error={aggregateResult?.error ?? null}
								requiresCustomer={aggregateRequiresCustomer}
								needsFeatures={aggregateNeedsFeatures}
								binSize={binSize}
								isFocused={!isFilterOpen}
							/>
						) : (
							<DataTable
								data={events ?? []}
								columns={columns}
								selectedIndex={state?.selectedIndex ?? 0}
								onSelect={(event, index) => {
									try {
										selectItem(event, index);
									} catch (err) {
										console.error("[EventsView] Error selecting item:", err);
										setComponentError(err instanceof Error ? err : new Error(String(err)));
									}
								}}
								isFocused={(state?.focusTarget === "table") && !isFilterOpen}
								keyExtractor={(e) => e?.id ?? ""}
								reservedWidth={sideOpen ? 45 : 0}
								searchOpen={false}
							/>
						)
					}
					side={
						showFilterPanel ? (
							<Box flexDirection="column" minWidth={40} height="100%">
								<EventsFilterSheet
									filters={draftFilters}
									features={features ?? []}
									isFocused={true}
									activeField={activeField}
									activeIndex={activeIndex}
									isEditingCustomer={isEditingCustomer}
									isEditingGroupBy={isEditingGroupBy}
									onApply={applyFilters}
									onClear={clearFilters}
								/>
								{/* Customer ID text input when editing */}
								{isEditingCustomer && (
									<Box
										marginTop={1}
										borderStyle="round"
										borderColor="cyan"
										paddingX={1}
									>
										<Text color="cyan">Customer: </Text>
										<TextInput
											value={draftFilters?.customerId ?? ""}
											onChange={setCustomerId}
											placeholder="Enter customer ID..."
										/>
									</Box>
								)}
								{/* Group By text input when editing */}
								{isEditingGroupBy && (
									<Box
										marginTop={1}
										borderStyle="round"
										borderColor="cyan"
										paddingX={1}
									>
										<Text color="cyan">Group by: properties.</Text>
										<TextInput
											value={(draftFilters?.groupBy ?? "").replace(/^properties\./, "")}
											onChange={setGroupBy}
											placeholder="property_name"
										/>
									</Box>
								)}
							</Box>
						) : showDetailSheet ? (
							<EventSheet
								event={state.selectedItem as ApiEventsListItem}
								isFocused={state?.focusTarget === "sheet"}
								copiedFeedback={showingFeedback}
							/>
						) : undefined
					}
					focusTarget={
						isFilterOpen ? "side" : (state?.focusTarget === "table") ? "main" : "side"
					}
					sideOpen={sideOpen}
					loadingIndicator={
						(isFetching || aggregateResult?.isFetching) ? <Text color="yellow">Loading...</Text> : undefined
					}
				/>
			</ListViewLayout>
		);
	} catch (err) {
		console.error("[EventsView] Error rendering component:", err);
		return (
			<EventsViewError 
				error={err instanceof Error ? err : new Error(String(err))} 
				onRetry={() => {
					setComponentError(null);
					refetch();
				}} 
			/>
		);
	}
}
