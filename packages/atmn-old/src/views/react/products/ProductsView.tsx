import { Text, useApp, useInput } from "ink";
import open from "open";
import { useCallback, useEffect, useMemo } from "react";
import type { ApiPlan } from "../../../lib/api/types/index.js";
import { AppEnv } from "../../../lib/env/detect.js";
import { APP_VERSION } from "../../../lib/version.js";
import { useClipboard } from "../../../lib/hooks/useClipboard.js";
import { useListNavigation, type FocusTarget } from "../../../lib/hooks/useListNavigation.js";
import { usePlans, useLocalPagination } from "../../../lib/hooks/usePlans.js";
import {
	DataTable,
	ListViewLayout,
	SplitPane,
	formatDate,
	type Column,
	type KeybindHint,
	type ListViewState,
} from "../primitives/index.js";
import { ProductSheet } from "./components/ProductSheet.js";

const AUTUMN_DASHBOARD_URL = "https://app.useautumn.com";

const PAGE_SIZE = 50;

const columns: Column<ApiPlan>[] = [
	{
		key: "id",
		header: "ID",
		render: (p) => p.id,
		minWidth: 8,
	},
	{
		key: "name",
		header: "Name",
		render: (p) => p.name,
	},
	{
		key: "version",
		header: "Ver",
		render: (p) => `v${p.version}`,
		minWidth: 4,
	},
	{
		key: "type",
		header: "Type",
		render: (p) => (p.add_on ? "Add-on" : p.auto_enable ? "Default" : "Plan"),
		minWidth: 7,
	},
	{
		key: "price",
		header: "Price",
		render: (p) =>
			!p.price
				? "Free"
				: `$${(p.price.amount / 100).toFixed(2)}/${p.price.interval}`,
		minWidth: 12,
	},
	{
		key: "features",
		header: "Features",
		render: (p) => `${p.items.length}`,
		minWidth: 8,
	},
	{
		key: "created",
		header: "Created",
		render: (p) => formatDate(p.created_at),
		minWidth: 14,
	},
];

const planSearchFn = (plan: ApiPlan, query: string): boolean => {
	const lowerQuery = query.toLowerCase();
	return (
		plan.id.toLowerCase().includes(lowerQuery) ||
		plan.name.toLowerCase().includes(lowerQuery) ||
		(plan.description?.toLowerCase().includes(lowerQuery) ?? false) ||
		(plan.group?.toLowerCase().includes(lowerQuery) ?? false)
	);
};

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

export interface ProductsViewProps {
	environment?: AppEnv;
	onExit?: () => void;
}

export function ProductsView({
	environment = AppEnv.Sandbox,
	onExit,
}: ProductsViewProps) {
	const { exit } = useApp();
	const { copy, showingFeedback } = useClipboard();

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
	} = useListNavigation<ApiPlan>();

	const { data: allPlans, isLoading, isError, error, refetch, isFetching } = usePlans({
		environment,
		includeArchived: true,
	});

	const {
		pageItems: plans,
		page,
		setPage,
		totalPages,
		hasMore,
		hasPrev,
		search: localSearch,
		setSearch: setLocalSearch,
		totalItems,
	} = useLocalPagination({
		items: allPlans ?? [],
		pageSize: PAGE_SIZE,
		searchFn: planSearchFn,
	});

	useEffect(() => {
		if (state.searchQuery !== localSearch) {
			setLocalSearch(state.searchQuery);
		}
	}, [state.searchQuery, localSearch, setLocalSearch]);

	const paginationText = useMemo(() => {
		if (totalItems === 0) return "";
		const start = (page - 1) * PAGE_SIZE + 1;
		const end = Math.min(page * PAGE_SIZE, totalItems);
		return `${start}-${end} of ${totalItems}`;
	}, [page, totalItems]);

	useInput(
		useCallback(
			(input, key) => {
				if (state.focusTarget === "search") {
					return;
				}

				if (input === "q") {
					if (onExit) {
						onExit();
					} else {
						exit();
					}
					return;
				}

				if (input === "r") {
					refetch();
					return;
				}

				if (input === "/" || input === "s") {
					openSearch();
					return;
				}

				if (input === "x" && state.searchQuery) {
					clearSearch();
					return;
				}

				if (state.focusTarget === "sheet" && state.sheetOpen) {
					if (input === "c" && state.selectedItem) {
						copy(state.selectedItem.id);
						return;
					}

					if (input === "o" && state.selectedItem) {
						const env = state.selectedItem.env === "live" ? "" : "/sandbox";
						open(
							`${AUTUMN_DASHBOARD_URL}${env}/products/${state.selectedItem.id}`,
						);
						return;
					}

					if (key.escape) {
						closeSheet();
						return;
					}

					if (key.tab) {
						toggleFocus();
						return;
					}

					return;
				}

				if (state.focusTarget === "table") {
					if (key.upArrow || input === "k") {
						moveUp();
						return;
					}

					if (key.downArrow || input === "j") {
						moveDown(plans.length - 1);
						return;
					}

					if ((input === "p" || key.leftArrow) && hasPrev) {
						prevPage();
						setPage(page - 1);
						return;
					}

					if ((input === "n" || key.rightArrow) && hasMore) {
						nextPage(hasMore);
						setPage(page + 1);
						return;
					}

					if (key.return && plans[state.selectedIndex]) {
						openSheet(plans[state.selectedIndex]!);
						return;
					}

					if (key.tab && state.sheetOpen) {
						toggleFocus();
						return;
					}
				}
			},
			[
				state,
				plans,
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

	useEffect(() => {
		if (plans.length > 0 && state.selectedIndex < plans.length) {
			selectItem(plans[state.selectedIndex]!, state.selectedIndex);
		}
	}, [plans, state.selectedIndex, selectItem]);

	const getViewState = (): ListViewState => {
		if (isLoading && !allPlans) return "loading";
		if (isError && error) return "error";
		if (!plans.length && !isFetching) return "empty";
		return "data";
	};

	return (
		<ListViewLayout
			viewState={getViewState()}
			commandName="atmn products"
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
			loadingMessage={`Loading ${environment === AppEnv.Live ? "live" : "sandbox"} products...`}
			error={error as Error}
			onRetry={refetch}
			emptyTitle={
				state.searchQuery
					? `No results for "${state.searchQuery}"`
					: "No products found"
			}
			emptyDescription={
				state.searchQuery
					? "Press 'x' to clear search"
					: "Create products via the API or Autumn dashboard"
			}
		>
			<SplitPane
				main={
					<DataTable
						data={plans}
						columns={columns}
						selectedIndex={state.selectedIndex}
						onSelect={(plan, index) => selectItem(plan, index)}
						isFocused={state.focusTarget === "table"}
						keyExtractor={(p) => p.id}
						reservedWidth={state.sheetOpen ? 45 : 0}
						searchOpen={state.searchOpen}
					/>
				}
				side={
					state.sheetOpen && state.selectedItem ? (
						<ProductSheet
							plan={state.selectedItem}
							isFocused={state.focusTarget === "sheet"}
							copiedFeedback={showingFeedback}
							onCopy={() => {
								if (state.selectedItem) {
									copy(state.selectedItem.id);
								}
							}}
							onOpenInBrowser={() => {
								if (state.selectedItem) {
									const env =
										state.selectedItem.env === "live" ? "" : "/sandbox";
									open(
										`${AUTUMN_DASHBOARD_URL}${env}/products/${state.selectedItem.id}`,
									);
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
