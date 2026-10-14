import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { useEffect } from "react";
import { create } from "zustand";

type CustomerBalanceSheetType = "edit-balance" | null;

interface CustomerBalanceSheetState {
	type: CustomerBalanceSheetType;
	previousType: CustomerBalanceSheetType;
	featureId: string | null;
	originalEntitlements: FullCusEntWithFullCusProduct[];
	selectedCusEntId: string | null;

	setSheet: (params: {
		type: CustomerBalanceSheetType;
		featureId?: string | null;
		originalEntitlements?: FullCusEntWithFullCusProduct[];
		selectedCusEntId?: string | null;
	}) => void;
	closeSheet: () => void;
	reset: () => void;
}

const initialState = {
	type: null as CustomerBalanceSheetType,
	previousType: null as CustomerBalanceSheetType,
	featureId: null as string | null,
	originalEntitlements: [] as FullCusEntWithFullCusProduct[],
	selectedCusEntId: null as string | null,
};

export const useCustomerBalanceSheetStore = create<CustomerBalanceSheetState>(
	(set) => ({
		...initialState,

		setSheet: ({
			type,
			featureId = null,
			originalEntitlements = [],
			selectedCusEntId = null,
		}) => {
			set((state) => ({
				previousType: state.type,
				type,
				featureId,
				originalEntitlements,
				selectedCusEntId,
			}));
		},

		closeSheet: () => {
			set((state) => ({
				previousType: state.type,
				type: null,
				featureId: null,
				originalEntitlements: [],
				selectedCusEntId: null,
			}));
		},

		reset: () => set(initialState),
	}),
);

const useIsCustomerBalanceSheetOpen = () =>
	useCustomerBalanceSheetStore((s) => s.type !== null);

const useCustomerBalanceSheetEscapeHandler = () => {
	const sheetType = useCustomerBalanceSheetStore((s) => s.type);
	const closeSheet = useCustomerBalanceSheetStore((s) => s.closeSheet);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && sheetType) {
				const isDialogOpen =
					document.querySelector('[role="dialog"]') ||
					document.querySelector('[data-state="open"][role="alertdialog"]') ||
					document.querySelector("dialog[open]");

				if (!isDialogOpen) {
					closeSheet();
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

const useCustomerBalanceSheetCleanup = () => {
	const closeSheet = useCustomerBalanceSheetStore((s) => s.closeSheet);

	useEffect(() => {
		return () => {
			closeSheet();
		};
	}, [closeSheet]);
};
