import type { ProductItem } from "@autumn/shared";
import { useEffect } from "react";
import { create } from "zustand";

// Sheet types that can be displayed
export type SheetType =
	| "edit-plan"
	| "edit-plan-price"
	| "edit-feature"
	| "new-feature"
	| "select-feature"
	| "attach-product"
	| "subscription-detail"
	| "subscription-update"
	| "subscription-update-v2"
	| "subscription-cancel"
	| "subscription-uncancel"
	| "balance-selection"
	| "balance-edit"
	| null;

// Store state interface
interface SheetState {
	// Current sheet type being displayed
	type: SheetType;
	// Previous sheet type (for animation coordination)
	previousType: SheetType;
	// Item ID being edited (e.g., "item-0", "item-1", product.id, or "new"/"select")
	itemId: string | null;
	// Explicit data payload for the sheet
	data: Record<string, unknown> | null;
	// Initial item state when sheet opened (for change detection)
	initialItem: ProductItem | null;

	// Actions
	setSheet: (params: {
		type: SheetType;
		itemId?: string | null;
		data?: Record<string, unknown> | null;
	}) => void;
	setInitialItem: (item: ProductItem | null) => void;
	closeSheet: () => void;
	reset: () => void;
}

// Initial state
const initialState = {
	type: null as SheetType,
	previousType: null as SheetType,
	itemId: null as string | null,
	data: null as Record<string, unknown> | null,
	initialItem: null as ProductItem | null,
};

export const useSheetStore = create<SheetState>((set) => ({
	...initialState,

	// Set the sheet type and optional itemId
	setSheet: ({ type, itemId = null, data = null }) => {
		set((state) => ({
			previousType: state.type,
			type,
			itemId,
			data,
			// Clear initialItem when sheet changes
			initialItem: null,
		}));
	},

	// Set the initial item state for change detection
	setInitialItem: (item) => set({ initialItem: item }),

	// Close the sheet
	closeSheet: () => {
		set((state) => ({
			previousType: state.type,
			type: null,
			itemId: null,
			data: null,
			initialItem: null,
		}));
	},

	// Reset to initial state
	reset: () => set(initialState),
}));

// Convenience selectors for common patterns
export const useIsSheetOpen = () => useSheetStore((s) => s.type !== null);
const useIsEditingPlan = () => useSheetStore((s) => s.type === "edit-plan");
const useIsEditingFeature = () =>
	useSheetStore((s) => s.type === "edit-feature");
const useIsCreatingFeature = () =>
	useSheetStore((s) => s.type === "new-feature" || s.itemId === "new");
export const useIsAttachingProduct = () =>
	useSheetStore((s) => s.type === "attach-product");
const useIsEditingPlanPrice = () =>
	useSheetStore((s) => s.type === "edit-plan-price");
const useIsViewingSubscriptionDetail = () =>
	useSheetStore((s) => s.type === "subscription-detail");
const useIsUpdatingSubscription = () =>
	useSheetStore((s) => s.type === "subscription-update");

/**
 * Hook to handle Escape key to close sheet and unfocus active elements
 * Only closes sheet if no dialog is currently open
 * @param onClose - Optional custom close handler. If not provided, uses default closeSheet.
 */
export const useSheetEscapeHandler = ({
	onClose,
}: {
	onClose?: () => void;
} = {}) => {
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

				const isInlineEditorOpen = document.querySelector(
					"[data-inline-editor-open]",
				);

				// Only close sheet if no dialog is open
				if (!isDialogOpen && !isInlineEditorOpen) {
					// Use custom onClose if provided, otherwise default closeSheet
					if (onClose) {
						onClose();
					} else {
						closeSheet();
					}
					// Unfocus any active element
					if (document.activeElement instanceof HTMLElement) {
						document.activeElement.blur();
					}
				}
			}
		};

		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [sheetType, closeSheet, onClose]);
};

/**
 * Hook to close sheet when component unmounts (e.g., navigating away)
 */
export const useSheetCleanup = () => {
	const closeSheet = useSheetStore((s) => s.closeSheet);

	useEffect(() => {
		closeSheet();
	}, [closeSheet]);
};
