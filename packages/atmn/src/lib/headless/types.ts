/**
 * Headless controller types for programmatic/AI interaction with list views.
 */

/**
 * Pagination information
 */
export interface PaginationState {
	page: number;
	pageSize: number;
	hasMore: boolean;
	totalLoaded: number;
}

/**
 * Generic list controller interface for headless operation.
 * Provides a programmatic API for AI agents to interact with list views.
 */
export interface ListController<T, TExpanded = T> {
	// ─────────────────────────────────────────────────────────────────
	// State Queries
	// ─────────────────────────────────────────────────────────────────

	/** Get all currently loaded items */
	getItems(): T[];

	/** Get the currently selected item (if any) */
	getSelectedItem(): T | null;

	/** Get the selected item index */
	getSelectedIndex(): number;

	/** Get pagination state */
	getPagination(): PaginationState;

	/** Check if there's a next page */
	hasNextPage(): boolean;

	/** Check if there's a previous page */
	hasPrevPage(): boolean;

	/** Get current search query (if any) */
	getSearchQuery(): string;

	// ─────────────────────────────────────────────────────────────────
	// Navigation Actions
	// ─────────────────────────────────────────────────────────────────

	/** Select item by index */
	selectByIndex(index: number): T | null;

	/** Select item by ID */
	selectById(id: string): T | null;

	/** Move selection up */
	selectPrev(): T | null;

	/** Move selection down */
	selectNext(): T | null;

	// ─────────────────────────────────────────────────────────────────
	// Data Actions
	// ─────────────────────────────────────────────────────────────────

	/** Go to next page */
	nextPage(): Promise<void>;

	/** Go to previous page */
	prevPage(): Promise<void>;

	/** Go to specific page */
	goToPage(page: number): Promise<void>;

	/** Search/filter items */
	search(query: string): Promise<void>;

	/** Clear search and refresh */
	clearSearch(): Promise<void>;

	/** Refresh current data */
	refresh(): Promise<void>;

	// ─────────────────────────────────────────────────────────────────
	// Detail Data
	// ─────────────────────────────────────────────────────────────────

	/** Get expanded details for an item (lazy loaded) */
	getExpandedItem(id: string): Promise<TExpanded | null>;

	// ─────────────────────────────────────────────────────────────────
	// Output Formats (for AI consumption)
	// ─────────────────────────────────────────────────────────────────

	/** Export current state as JSON */
	toJSON(): ListControllerState<T>;

	/** Human-readable description of current state */
	describe(): string;

	/** List available actions based on current state */
	getAvailableActions(): string[];
}

/**
 * Serializable state for JSON export
 */
export interface ListControllerState<T> {
	items: T[];
	selectedIndex: number;
	selectedItem: T | null;
	pagination: PaginationState;
	searchQuery: string;
	availableActions: string[];
}

/**
 * Options for creating a list controller
 */
export interface ListControllerOptions {
	/** Page size for pagination */
	pageSize?: number;
	/** Initial search query */
	initialSearch?: string;
	/** Initial page */
	initialPage?: number;
}

/**
 * Result of a headless command execution
 */
export interface HeadlessResult<T> {
	success: boolean;
	data?: T;
	error?: string;
	state: ListControllerState<T>;
}
