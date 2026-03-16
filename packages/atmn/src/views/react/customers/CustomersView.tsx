import { Text, useApp, useInput } from "ink";
import open from "open";
import { useCallback, useEffect } from "react";
import type { ApiCustomer } from "../../../lib/api/endpoints/customers.js";
import { AppEnv } from "../../../lib/env/detect.js";
import { APP_VERSION } from "../../../lib/version.js";
import { useClipboard } from "../../../lib/hooks/useClipboard.js";
import { useCustomerExpanded } from "../../../lib/hooks/useCustomerExpanded.js";
import {
	useCustomerNavigation,
	type FocusTarget,
} from "../../../lib/hooks/useCustomerNavigation.js";
import { useCustomers } from "../../../lib/hooks/useCustomers.js";
import {
	DataTable,
	ListViewLayout,
	SplitPane,
	formatDate,
	getPaginationDisplay,
	type Column,
	type KeybindHint,
	type ListViewState,
} from "../primitives/index.js";
// Keep CustomerSheet - it's domain-specific
import { CustomerSheet } from "./components/CustomerSheet.js";

const AUTUMN_DASHBOARD_URL = "https://app.useautumn.com";

const PAGE_SIZE = 50;

// Column definitions for the DataTable
const columns: Column<ApiCustomer>[] = [
	{
		key: "id",
		header: "ID",
		render: (c) => c.id,
		minWidth: 8,
	},
	{
		key: "name",
		header: "Name",
		render: (c) => c.name ?? "-",
	},
	{
		key: "email",
		header: "Email",
		render: (c) => c.email ?? "-",
	},
	{
		key: "created",
		header: "Created",
		render: (c) => formatDate(c.created_at),
		minWidth: 14,
	},
];

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
		{ key: "↑↓", label: "navigate" },
		{ key: "←", label: "prev page", visible: canGoPrev },
		{ key: "→", label: "next page", visible: canGoNext },
		{ key: "Enter", label: "inspect" },
		{ key: "/", label: "search" },
		{ key: "x", label: "clear search", visible: !!searchQuery },
		{ key: "r", label: "refresh" },
		{ key: "q", label: "quit" },
	];
};

export interface CustomersViewProps {
	environment?: AppEnv;
	/** Called when user exits (q or ctrl+c) - use to clear terminal */
	onExit?: () => void;
}

/**
 * Main customers view orchestrator
 */
export function CustomersView({
	environment = AppEnv.Sandbox,
	onExit,
}: CustomersViewProps) {
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
		selectCustomer,
		openSearch,
		closeSearch,
		setSearchQuery,
		clearSearch,
	} = useCustomerNavigation();

	const { data, isLoading, isError, error, refetch, isFetching } = useCustomers(
		{
			page: state.page,
			pageSize: PAGE_SIZE,
			environment,
			search: state.searchQuery,
		},
	);

	// Lazy load expanded customer data when sheet is open
	const {
		data: expandedCustomer,
		isLoading: isLoadingExpanded,
		error: expandedError,
	} = useCustomerExpanded({
		customerId: state.selectedCustomer?.id ?? null,
		environment,
		enabled: state.sheetOpen && !!state.selectedCustomer?.id,
	});

	const customers = data?.list ?? [];
	const hasMore = data?.has_more ?? false;
	const pagination = getPaginationDisplay(
		state.page,
		customers.length,
		PAGE_SIZE,
		hasMore,
	);

	// Handle keyboard input
	useInput(
		useCallback(
			(input, key) => {
				// Don't handle input when search dialog is open (it handles its own input)
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
					if (input === "c" && state.selectedCustomer) {
						copy(state.selectedCustomer.id);
						return;
					}

					// Open in Autumn dashboard
					if (input === "o" && state.selectedCustomer) {
						const env = state.selectedCustomer.env === "live" ? "" : "/sandbox";
						open(
							`${AUTUMN_DASHBOARD_URL}${env}/customers/${state.selectedCustomer.id}`,
						);
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
						moveDown(customers.length - 1);
						return;
					}

					// Previous page
					if (key.leftArrow && pagination.canGoPrev) {
						prevPage();
						return;
					}

					// Next page
					if (key.rightArrow && pagination.canGoNext) {
						nextPage(pagination.canGoNext);
						return;
					}

					// Open sheet
					if (key.return && customers[state.selectedIndex]) {
						openSheet(customers[state.selectedIndex]!);
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
				customers,
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
				openSearch,
				clearSearch,
			],
		),
	);

	// Sync selected customer when customers load
	useEffect(() => {
		if (customers.length > 0 && state.selectedIndex < customers.length) {
			selectCustomer(customers[state.selectedIndex]!, state.selectedIndex);
		}
	}, [customers, state.selectedIndex, selectCustomer]);

	// Determine view state for ListViewLayout
	const getViewState = (): ListViewState => {
		if (isLoading && !data) return "loading";
		if (isError && error) return "error";
		if (!customers.length && !isFetching) return "empty";
		return "data";
	};

	return (
		<ListViewLayout
			viewState={getViewState()}
			commandName="atmn customers"
			version={APP_VERSION}
			paginationText={pagination.text}
			searchQuery={state.searchQuery}
			searchOpen={state.searchOpen}
			onSearchSubmit={setSearchQuery}
			onSearchCancel={closeSearch}
			hints={getHints(
				state.focusTarget,
				state.sheetOpen,
				pagination.canGoPrev,
				pagination.canGoNext,
				state.searchQuery,
			)}
			loadingMessage={`Loading ${environment === AppEnv.Live ? "live" : "sandbox"} customers...`}
			error={error as Error}
			onRetry={refetch}
			emptyTitle={
				state.searchQuery
					? `No results for "${state.searchQuery}"`
					: "No customers found"
			}
			emptyDescription={
				state.searchQuery
					? "Press 'x' to clear search"
					: "Create customers via the API or Autumn dashboard"
			}
		>
			<SplitPane
				main={
					<DataTable
						data={customers}
						columns={columns}
						selectedIndex={state.selectedIndex}
						onSelect={(customer, index) => selectCustomer(customer, index)}
						isFocused={state.focusTarget === "table"}
						keyExtractor={(c) => c.id}
						reservedWidth={state.sheetOpen ? 45 : 0}
						searchOpen={state.searchOpen}
					/>
				}
				side={
					state.sheetOpen && state.selectedCustomer ? (
						<CustomerSheet
							customer={state.selectedCustomer}
							isFocused={state.focusTarget === "sheet"}
							copiedFeedback={showingFeedback}
							onCopy={() => {
								if (state.selectedCustomer) {
									copy(state.selectedCustomer.id);
								}
							}}
							onOpenInBrowser={() => {
								if (state.selectedCustomer) {
									const env =
										state.selectedCustomer.env === "live" ? "" : "/sandbox";
									open(
										`${AUTUMN_DASHBOARD_URL}${env}/customers/${state.selectedCustomer.id}`,
									);
								}
							}}
							expandedCustomer={expandedCustomer}
							isLoadingExpanded={isLoadingExpanded}
							expandedError={expandedError as Error | null}
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
