import { create } from "zustand";

// Sheet types that can be displayed
export type SheetType =
	| "edit-plan"
	| "edit-feature"
	| "new-feature"
	| "select-feature"
	| null;

// Store state interface
interface SheetState {
	// Current sheet type being displayed
	type: SheetType;
	// Item ID being edited (e.g., "item-0", "item-1", product.id, or "new"/"select")
	itemId: string | null;

	// Actions
	setSheet: (params: { type: SheetType; itemId?: string | null }) => void;
	closeSheet: () => void;
	reset: () => void;
}

// Initial state
const initialState = {
	type: null as SheetType,
	itemId: null as string | null,
};

export const useSheetStore = create<SheetState>((set) => ({
	...initialState,

	// Set the sheet type and optional itemId
	setSheet: ({ type, itemId = null }) => {
		set({ type, itemId });
	},

	// Close the sheet
	closeSheet: () => {
		set({ type: null, itemId: null });
	},

	// Reset to initial state
	reset: () => set(initialState),
}));

// Convenience selectors for common patterns
export const useIsSheetOpen = () => useSheetStore((s) => s.type !== null);
export const useIsEditingPlan = () =>
	useSheetStore((s) => s.type === "edit-plan");
export const useIsEditingFeature = () =>
	useSheetStore((s) => s.type === "edit-feature");
export const useIsCreatingFeature = () =>
	useSheetStore((s) => s.type === "new-feature" || s.itemId === "new");
