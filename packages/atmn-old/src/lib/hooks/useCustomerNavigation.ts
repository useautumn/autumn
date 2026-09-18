import { useCallback, useReducer } from "react";
import type { ApiCustomer } from "../api/endpoints/customers.js";

export type FocusTarget = "table" | "sheet" | "search";

export interface NavigationState {
	page: number;
	selectedIndex: number;
	sheetOpen: boolean;
	searchOpen: boolean;
	searchQuery: string;
	focusTarget: FocusTarget;
	selectedCustomer: ApiCustomer | null;
	copiedFeedback: boolean;
}

export type NavigationAction =
	| { type: "MOVE_UP" }
	| { type: "MOVE_DOWN"; maxIndex: number }
	| { type: "NEXT_PAGE"; canNavigate: boolean }
	| { type: "PREV_PAGE" }
	| { type: "OPEN_SHEET"; customer: ApiCustomer }
	| { type: "CLOSE_SHEET" }
	| { type: "TOGGLE_FOCUS" }
	| { type: "COPY_ID" }
	| { type: "CLEAR_COPIED_FEEDBACK" }
	| { type: "SELECT_CUSTOMER"; customer: ApiCustomer; index: number }
	| { type: "OPEN_SEARCH" }
	| { type: "CLOSE_SEARCH" }
	| { type: "SET_SEARCH_QUERY"; query: string };

const initialState: NavigationState = {
	page: 1,
	selectedIndex: 0,
	sheetOpen: false,
	searchOpen: false,
	searchQuery: "",
	focusTarget: "table",
	selectedCustomer: null,
	copiedFeedback: false,
};

function navigationReducer(
	state: NavigationState,
	action: NavigationAction,
): NavigationState {
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

		case "OPEN_SHEET":
			return {
				...state,
				sheetOpen: true,
				focusTarget: "sheet",
				selectedCustomer: action.customer,
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

		case "COPY_ID":
			return { ...state, copiedFeedback: true };

		case "CLEAR_COPIED_FEEDBACK":
			return { ...state, copiedFeedback: false };

		case "SELECT_CUSTOMER":
			return {
				...state,
				selectedIndex: action.index,
				selectedCustomer: action.customer,
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

		default:
			return state;
	}
}

export function useCustomerNavigation() {
	const [state, dispatch] = useReducer(navigationReducer, initialState);

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

	const openSheet = useCallback((customer: ApiCustomer) => {
		dispatch({ type: "OPEN_SHEET", customer });
	}, []);

	const closeSheet = useCallback(() => {
		dispatch({ type: "CLOSE_SHEET" });
	}, []);

	const toggleFocus = useCallback(() => {
		dispatch({ type: "TOGGLE_FOCUS" });
	}, []);

	const copyId = useCallback(() => {
		dispatch({ type: "COPY_ID" });
	}, []);

	const clearCopiedFeedback = useCallback(() => {
		dispatch({ type: "CLEAR_COPIED_FEEDBACK" });
	}, []);

	const selectCustomer = useCallback((customer: ApiCustomer, index: number) => {
		dispatch({ type: "SELECT_CUSTOMER", customer, index });
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

	return {
		state,
		dispatch,
		moveUp,
		moveDown,
		nextPage,
		prevPage,
		openSheet,
		closeSheet,
		toggleFocus,
		copyId,
		clearCopiedFeedback,
		selectCustomer,
		openSearch,
		closeSearch,
		setSearchQuery,
		clearSearch,
	};
}
