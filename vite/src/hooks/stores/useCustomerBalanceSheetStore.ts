import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { useEffect } from "react";
import { create } from "zustand";

// Sheet types that can be displayed
export type CustomerBalanceSheetType = "edit-balance" | null;

// Store state interface
interface CustomerBalanceSheetState {
	// Current sheet type being displayed
	type: CustomerBalanceSheetType;
	// Previous sheet type (for animation coordination)
	previousType: CustomerBalanceSheetType;
	// Feature ID being edited
	featureId: string | null;
	// Original entitlements that were aggregated for this feature
	originalEntitlements: FullCusEntWithFullCusProduct[];

	// Actions
	setSheet: (params: {
		type: CustomerBalanceSheetType;
		featureId?: string | null;
		originalEntitlements?: FullCusEntWithFullCusProduct[];
	}) => void;
	closeSheet: () => void;
	reset: () => void;
}

// Initial state
const initialState = {
	type: null as CustomerBalanceSheetType,
	previousType: null as CustomerBalanceSheetType,
	featureId: null as string | null,
	originalEntitlements: [] as FullCusEntWithFullCusProduct[],
};

export const useCustomerBalanceSheetStore = create<CustomerBalanceSheetState>(
	(set) => ({
		...initialState,

		// Set the sheet type and optional featureId/entitlements
		setSheet: ({ type, featureId = null, originalEntitlements = [] }) => {
			set((state) => ({
				previousType: state.type,
				type,
				featureId,
				originalEntitlements,
			}));
		},

		// Close the sheet
		closeSheet: () => {
			set((state) => ({
				previousType: state.type,
				type: null,
				featureId: null,
				originalEntitlements: [],
			}));
		},

		// Reset to initial state
		reset: () => set(initialState),
	}),
);

// Convenience selectors
export const useIsCustomerBalanceSheetOpen = () =>
	useCustomerBalanceSheetStore((s) => s.type !== null);

/**
 * Hook to handle Escape key to close sheet and unfocus active elements
 * Only closes sheet if no dialog is currently open
 */
export const useCustomerBalanceSheetEscapeHandler = () => {
	const sheetType = useCustomerBalanceSheetStore((s) => s.type);
	const closeSheet = useCustomerBalanceSheetStore((s) => s.closeSheet);

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
export const useCustomerBalanceSheetCleanup = () => {
	const closeSheet = useCustomerBalanceSheetStore((s) => s.closeSheet);

	useEffect(() => {
		return () => {
			closeSheet();
		};
	}, [closeSheet]);
};
