import { Text, useApp, useInput } from "ink";
import open from "open";
import { useCallback, useEffect, useMemo } from "react";
import type { ApiFeature } from "../../../lib/api/types/index.js";
import { AppEnv } from "../../../lib/env/detect.js";
import { APP_VERSION } from "../../../lib/version.js";
import { useClipboard } from "../../../lib/hooks/useClipboard.js";
import { useFeatures } from "../../../lib/hooks/useFeatures.js";
import {
	useListNavigation,
	type FocusTarget,
} from "../../../lib/hooks/useListNavigation.js";
import { useLocalPagination } from "../../../lib/hooks/usePlans.js";
import {
	DataTable,
	ListViewLayout,
	SplitPane,
	type Column,
	type KeybindHint,
	type ListViewState,
} from "../primitives/index.js";
import { FeatureSheet } from "./components/FeatureSheet.js";

const AUTUMN_DASHBOARD_URL = "https://app.useautumn.com";

const PAGE_SIZE = 50;

// Column definitions for the DataTable
const columns: Column<ApiFeature>[] = [
	{
		key: "id",
		header: "ID",
		render: (f) => f.id,
		minWidth: 12,
	},
	{
		key: "name",
		header: "Name",
		render: (f) => f.name,
	},
	{
		key: "type",
		header: "Type",
		render: (f) => f.type,
		minWidth: 12,
	},
	{
		key: "consumable",
		header: "Consumable",
		render: (f) => (f.consumable ? "Yes" : "No"),
		minWidth: 10,
	},
	{
		key: "status",
		header: "Status",
		render: (f) => (f.archived ? "Archived" : "Active"),
		minWidth: 8,
	},
];

// Search function for features
const featureSearchFn = (feature: ApiFeature, query: string): boolean => {
	const lowerQuery = query.toLowerCase();
	return (
		feature.id.toLowerCase().includes(lowerQuery) ||
		feature.name.toLowerCase().includes(lowerQuery) ||
		feature.type.toLowerCase().includes(lowerQuery)
	);
};

// Generate keyboard hints based on current state
const getHints = (
	focusTarget: FocusTarget,
	sheetOpen: boolean,
	canGoPrev: boolean,
	canGoNext: boolean,
	searchQuery: string,
): KeybindHint[] => {
	if (focusTarget === "sheet" && sheetOpen) {
		return [
			{ key: "Tab", label: "focus table" },
			{ key: "Esc", label: "close" },
			{ key: "c", label: "copy ID" },
			{ key: "o", label: "open" },
			{ key: "q", label: "quit" },
		];
	}

	return [
		{ key: "↑/↓", label: "navigate" },
		{ key: "n", label: "next page", visible: canGoNext },
		{ key: "p", label: "prev page", visible: canGoPrev },
		{ key: "Enter", label: "inspect" },
		{ key: "/", label: "search" },
		{ key: "x", label: "clear search", visible: !!searchQuery },
		{ key: "r", label: "refresh" },
		{ key: "q", label: "quit" },
	];
};

export interface FeaturesViewProps {
	environment?: AppEnv;
	/** Called when user exits (q or ctrl+c) - use to clear terminal */
	onExit?: () => void;
}

/**
 * Main features view orchestrator
 */
export function FeaturesView({
	environment = AppEnv.Sandbox,
	onExit,
}: FeaturesViewProps) {
	const { exit } = useApp();
	const { copy, showingFeedback } = useClipboard();

	// Navigation state using generic hook
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
		openSearch,
		closeSearch,
		setSearchQuery,
		clearSearch,
	} = useListNavigation<ApiFeature>();

	// Fetch all features (no server pagination)
	const {
		data: allFeatures,
		isLoading,
		isError,
		error,
		refetch,
		isFetching,
	} = useFeatures({
		environment,
		includeArchived: true,
	});

	// Local pagination with search
	const {
		pageItems: features,
		page,
		setPage,
		totalPages,
		hasMore,
		hasPrev,
		search: localSearch,
		setSearch: setLocalSearch,
		totalItems,
	} = useLocalPagination({
		items: allFeatures ?? [],
		pageSize: PAGE_SIZE,
		searchFn: featureSearchFn,
	});

	// Sync local search with navigation state
	useEffect(() => {
		if (state.searchQuery !== localSearch) {
			setLocalSearch(state.searchQuery);
		}
	}, [state.searchQuery, localSearch, setLocalSearch]);

	// Generate pagination display text
	const paginationText = useMemo(() => {
		if (totalItems === 0) return "";
		const start = (page - 1) * PAGE_SIZE + 1;
		const end = Math.min(page * PAGE_SIZE, totalItems);
		return `${start}-${end} of ${totalItems}`;
	}, [page, totalItems]);

	// Handle keyboard input
	useInput(
		useCallback(
			(input, key) => {
				// Don't handle input when search dialog is open
				if (state.focusTarget === "search") {
					return;
				}

				// Quit
				if (input === "q") {
					if (onExit) {
						onExit();
					} else {
						exit();
					}
					return;
				}

				// Refresh
				if (input === "r") {
					refetch();
					return;
				}

				// Open search (/ or s)
				if (input === "/" || input === "s") {
					openSearch();
					return;
				}

				// Clear search (x when search is active)
				if (input === "x" && state.searchQuery) {
					clearSearch();
					return;
				}

				// Sheet-specific controls
				if (state.focusTarget === "sheet" && state.sheetOpen) {
					// Copy ID
					if (input === "c" && state.selectedItem) {
						copy(state.selectedItem.id);
						return;
					}

					// Open in Autumn dashboard
					if (input === "o" && state.selectedItem) {
						open(`${AUTUMN_DASHBOARD_URL}/sandbox/features`);
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

				// Table-specific controls
				if (state.focusTarget === "table") {
					// Navigate up
					if (key.upArrow || input === "k") {
						moveUp();
						return;
					}

					// Navigate down
					if (key.downArrow || input === "j") {
						moveDown(features.length - 1);
						return;
					}

					// Previous page (p or left arrow)
					if ((input === "p" || key.leftArrow) && hasPrev) {
						prevPage();
						setPage(page - 1);
						return;
					}

					// Next page (n or right arrow)
					if ((input === "n" || key.rightArrow) && hasMore) {
						nextPage(hasMore);
						setPage(page + 1);
						return;
					}

					// Open sheet
					if (key.return) {
						const feature = features[state.selectedIndex];
						if (feature) {
							openSheet(feature);
						}
						return;
					}

					// Toggle focus to sheet (if open)
					if (key.tab && state.sheetOpen) {
						toggleFocus();
						return;
					}
				}
			},
			[
				state,
				features,
				page,
				hasMore,
				hasPrev,
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
				openSearch,
				clearSearch,
				setPage,
			],
		),
	);

	// Sync selected feature when features load
	useEffect(() => {
		const feature = features[state.selectedIndex];
		if (features.length > 0 && feature) {
			selectItem(feature, state.selectedIndex);
		}
	}, [features, state.selectedIndex, selectItem]);

	// Determine view state for ListViewLayout
	const getViewState = (): ListViewState => {
		if (isLoading && !allFeatures) return "loading";
		if (isError && error) return "error";
		if (!features.length && !isFetching) return "empty";
		return "data";
	};

	return (
		<ListViewLayout
			viewState={getViewState()}
			commandName="atmn features"
			version={APP_VERSION}
			paginationText={paginationText}
			searchQuery={state.searchQuery}
			searchOpen={state.searchOpen}
			onSearchSubmit={setSearchQuery}
			onSearchCancel={closeSearch}
			hints={getHints(
				state.focusTarget,
				state.sheetOpen,
				hasPrev,
				hasMore,
				state.searchQuery,
			)}
			loadingMessage={`Loading ${environment === AppEnv.Live ? "live" : "sandbox"} features...`}
			error={error as Error}
			onRetry={refetch}
			emptyTitle={
				state.searchQuery
					? `No results for "${state.searchQuery}"`
					: "No features found"
			}
			emptyDescription={
				state.searchQuery
					? "Press 'x' to clear search"
					: "Create features via the API or Autumn dashboard"
			}
		>
			<SplitPane
				main={
					<DataTable
						data={features}
						columns={columns}
						selectedIndex={state.selectedIndex}
						onSelect={(feature, index) => selectItem(feature, index)}
						isFocused={state.focusTarget === "table"}
						keyExtractor={(f) => f.id}
						reservedWidth={state.sheetOpen ? 45 : 0}
						searchOpen={state.searchOpen}
					/>
				}
				side={
					state.sheetOpen && state.selectedItem ? (
						<FeatureSheet
							feature={state.selectedItem}
							isFocused={state.focusTarget === "sheet"}
							copiedFeedback={showingFeedback}
							onCopy={() => {
								if (state.selectedItem) {
									copy(state.selectedItem.id);
								}
							}}
							onOpenInBrowser={() => {
								if (state.selectedItem) {
									open(`${AUTUMN_DASHBOARD_URL}/sandbox/features`);
								}
							}}
						/>
					) : undefined
				}
				focusTarget={state.focusTarget === "table" ? "main" : "side"}
				sideOpen={state.sheetOpen}
				loadingIndicator={
					isFetching ? <Text color="yellow">Loading...</Text> : undefined
				}
			/>
		</ListViewLayout>
	);
}
