export interface PaginationState {
	page: number;
	pageSize: number;
	hasMore: boolean;
	totalLoaded: number;
}

export interface ListController<T, TExpanded = T> {
	getItems(): T[];

	getSelectedItem(): T | null;

	getSelectedIndex(): number;

	getPagination(): PaginationState;

	hasNextPage(): boolean;

	hasPrevPage(): boolean;

	getSearchQuery(): string;

	selectByIndex(index: number): T | null;

	selectById(id: string): T | null;

	selectPrev(): T | null;

	selectNext(): T | null;

	nextPage(): Promise<void>;

	prevPage(): Promise<void>;

	goToPage(page: number): Promise<void>;

	search(query: string): Promise<void>;

	clearSearch(): Promise<void>;

	refresh(): Promise<void>;

	getExpandedItem(id: string): Promise<TExpanded | null>;

	toJSON(): ListControllerState<T>;

	describe(): string;

	getAvailableActions(): string[];
}

export interface ListControllerState<T> {
	items: T[];
	selectedIndex: number;
	selectedItem: T | null;
	pagination: PaginationState;
	searchQuery: string;
	availableActions: string[];
}

export interface ListControllerOptions {
	pageSize?: number;
	initialSearch?: string;
	initialPage?: number;
}

export interface HeadlessResult<T> {
	success: boolean;
	data?: T;
	error?: string;
	state: ListControllerState<T>;
}
