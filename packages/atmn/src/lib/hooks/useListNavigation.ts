import { useCallback, useReducer } from "react";

export type FocusTarget = "table" | "sheet" | "search";

export interface ListNavigationState<T> {
	page: number;
	selectedIndex: number;
	sheetOpen: boolean;
	searchOpen: boolean;
	searchQuery: string;
	focusTarget: FocusTarget;
	selectedItem: T | null;
}

export type ListNavigationAction<T> =
	| { type: "MOVE_UP" }
	| { type: "MOVE_DOWN"; maxIndex: number }
	| { type: "NEXT_PAGE"; canNavigate: boolean }
	| { type: "PREV_PAGE" }
	| { type: "RESET_PAGE" }
	| { type: "OPEN_SHEET"; item: T }
	| { type: "CLOSE_SHEET" }
	| { type: "TOGGLE_FOCUS" }
	| { type: "SELECT_ITEM"; item: T; index: number }
	| { type: "OPEN_SEARCH" }
	| { type: "CLOSE_SEARCH" }
	| { type: "SET_SEARCH_QUERY"; query: string }
	| { type: "RESET" };

const initialState: ListNavigationState<unknown> = {
	page: 1,
	selectedIndex: 0,
	sheetOpen: false,
	searchOpen: false,
	searchQuery: "",
	focusTarget: "table",
	selectedItem: null,
};

function createNavigationReducer<T>() {
	return function navigationReducer(
		state: ListNavigationState<T>,
		action: ListNavigationAction<T>,
	): ListNavigationState<T> {
		switch (action.type) {
			case "MOVE_UP":
				if (state.selectedIndex > 0) {
					return { ...state, selectedIndex: state.selectedIndex - 1 };
				}
				return state;

			case "MOVE_DOWN":
				if (state.selectedIndex < action.maxIndex) {
					return { ...state, selectedIndex: state.selectedIndex + 1 };
				}
				return state;

			case "NEXT_PAGE":
				if (action.canNavigate) {
					return { ...state, page: state.page + 1, selectedIndex: 0 };
				}
				return state;

		case "PREV_PAGE":
			if (state.page > 1) {
				return { ...state, page: state.page - 1, selectedIndex: 0 };
			}
			return state;

		case "RESET_PAGE":
			return { ...state, page: 1, selectedIndex: 0 };

		case "OPEN_SHEET":
				return {
					...state,
					sheetOpen: true,
					focusTarget: "sheet",
					selectedItem: action.item,
				};

			case "CLOSE_SHEET":
				return {
					...state,
					sheetOpen: false,
					focusTarget: "table",
				};

			case "TOGGLE_FOCUS":
				if (state.sheetOpen) {
					return {
						...state,
						focusTarget: state.focusTarget === "table" ? "sheet" : "table",
					};
				}
				return state;

			case "SELECT_ITEM":
				return {
					...state,
					selectedIndex: action.index,
					selectedItem: action.item,
				};

			case "OPEN_SEARCH":
				return {
					...state,
					searchOpen: true,
					focusTarget: "search",
				};

			case "CLOSE_SEARCH":
				return {
					...state,
					searchOpen: false,
					focusTarget: "table",
				};

			case "SET_SEARCH_QUERY":
				return {
					...state,
					searchQuery: action.query,
					searchOpen: false,
					focusTarget: "table",
					page: 1,
					selectedIndex: 0,
				};

			case "RESET":
				return initialState as ListNavigationState<T>;

			default:
				return state;
		}
	};
}

export function useListNavigation<T>(): {
	state: ListNavigationState<T>;
	dispatch: React.Dispatch<ListNavigationAction<T>>;
	moveUp: () => void;
	moveDown: (maxIndex: number) => void;
	nextPage: (canNavigate: boolean) => void;
	prevPage: () => void;
	resetPage: () => void;
	openSheet: (item: T) => void;
	closeSheet: () => void;
	toggleFocus: () => void;
	selectItem: (item: T, index: number) => void;
	openSearch: () => void;
	closeSearch: () => void;
	setSearchQuery: (query: string) => void;
	clearSearch: () => void;
	reset: () => void;
} {
	const reducer = createNavigationReducer<T>();
	const [state, dispatch] = useReducer(
		reducer,
		initialState as ListNavigationState<T>,
	);

	const moveUp = useCallback(() => {
		dispatch({ type: "MOVE_UP" });
	}, []);

	const moveDown = useCallback((maxIndex: number) => {
		dispatch({ type: "MOVE_DOWN", maxIndex });
	}, []);

	const nextPage = useCallback((canNavigate: boolean) => {
		dispatch({ type: "NEXT_PAGE", canNavigate });
	}, []);

	const prevPage = useCallback(() => {
		dispatch({ type: "PREV_PAGE" });
	}, []);

	const resetPage = useCallback(() => {
		dispatch({ type: "RESET_PAGE" });
	}, []);

	const openSheet = useCallback((item: T) => {
		dispatch({ type: "OPEN_SHEET", item });
	}, []);

	const closeSheet = useCallback(() => {
		dispatch({ type: "CLOSE_SHEET" });
	}, []);

	const toggleFocus = useCallback(() => {
		dispatch({ type: "TOGGLE_FOCUS" });
	}, []);

	const selectItem = useCallback((item: T, index: number) => {
		dispatch({ type: "SELECT_ITEM", item, index });
	}, []);

	const openSearch = useCallback(() => {
		dispatch({ type: "OPEN_SEARCH" });
	}, []);

	const closeSearch = useCallback(() => {
		dispatch({ type: "CLOSE_SEARCH" });
	}, []);

	const setSearchQuery = useCallback((query: string) => {
		dispatch({ type: "SET_SEARCH_QUERY", query });
	}, []);

	const clearSearch = useCallback(() => {
		dispatch({ type: "SET_SEARCH_QUERY", query: "" });
	}, []);

	const reset = useCallback(() => {
		dispatch({ type: "RESET" });
	}, []);

	return {
		state,
		dispatch,
		moveUp,
		moveDown,
		nextPage,
		prevPage,
		resetPage,
		openSheet,
		closeSheet,
		toggleFocus,
		selectItem,
		openSearch,
		closeSearch,
		setSearchQuery,
		clearSearch,
		reset,
	};
}
