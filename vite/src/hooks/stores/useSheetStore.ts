import { useEffect } from "react";
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
	// Previous sheet type (for animation coordination)
	previousType: SheetType;
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
	previousType: null as SheetType,
	itemId: null as string | null,
};

export const useSheetStore = create<SheetState>((set) => ({
	...initialState,

	// Set the sheet type and optional itemId
	setSheet: ({ type, itemId = null }) => {
		set((state) => ({ previousType: state.type, type, itemId }));
	},

	// Close the sheet
	closeSheet: () => {
		set((state) => ({ previousType: state.type, type: null, itemId: null }));
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

/**
 * Hook to handle Escape key to close sheet and unfocus active elements
 * Only closes sheet if no dialog is currently open
 */
export const useSheetEscapeHandler = () => {
	const sheetType = useSheetStore((s) => s.type);
	const closeSheet = useSheetStore((s) => s.closeSheet);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && sheetType) {
				// Check if any dialog is open (Radix UI, native dialog, etc.)
				const isDialogOpen =
					document.querySelector('[role="dialog"]') ||
					document.querySelector('[data-state="open"][role="alertdialog"]') ||
					document.querySelector("dialog[open]");

				// Only close sheet if no dialog is open
				if (!isDialogOpen) {
					closeSheet();
					// Unfocus any active element
					if (document.activeElement instanceof HTMLElement) {
						document.activeElement.blur();
					}
				}
			}
		};

		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [sheetType, closeSheet]);
};

/**
 * Hook to close sheet when component unmounts (e.g., navigating away)
 */
export const useSheetCleanup = () => {
	const closeSheet = useSheetStore((s) => s.closeSheet);

	useEffect(() => {
		return () => {
			closeSheet();
		};
	}, [closeSheet]);
};
