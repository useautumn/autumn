import type { FrontendProduct, ProductItem } from "@autumn/shared";
import { useEffect } from "react";
import { create } from "zustand";

export type SheetType =
	| "edit-plan"
	| "edit-plan-price"
	| "edit-feature"
	| "new-feature"
	| "select-feature"
	| "attach-product"
	| "attach-review"
	| "attach-send-invoice"
	| "attach-checkout-session"
	| "attach-schedule-plan"
	| "subscription-detail"
	| "license-detail"
	| "license-pool-detail"
	| "subscription-update"
	| "subscription-update-send-invoice"
	| "subscription-cancel"
	| "subscription-uncancel"
	| "balance-edit"
	| "balance-delete"
	| "balance-create"
	| "invoice-detail"
	| "invoice-reissue"
	| "invoice-credit-note"
	| "create-invoice"
	| "upcoming-invoice-detail"
	| "sync-stripe"
	| "sync-stripe-v2"
	| "verify-stripe"
	| "customer-config-edit"
	| "billing-auto-topup-add"
	| "billing-auto-topup-edit"
	| "billing-spend-limit-add"
	| "billing-spend-limit-edit"
	| "billing-usage-limit-add"
	| "billing-usage-limit-edit"
	| "billing-usage-alert-add"
	| "billing-usage-alert-edit"
	| "billing-usage-alerts-feature"
	| "billing-overage-allowed-add"
	| "billing-overage-allowed-edit"
	| "billing-control-plan-managed"
	| "record-usage"
	| "check-balance"
	| "allocate-balances"
	| "create-schedule-choose-subscription"
	| "create-schedule"
	| "create-schedule-review"
	| "create-schedule-send-invoice"
	| "create-schedule-checkout"
	| null;

interface SheetState {
	type: SheetType;
	previousType: SheetType;
	itemId: string | null;
	data: Record<string, unknown> | null;
	initialItem: ProductItem | null;
	initialProduct: FrontendProduct | null;

	setSheet: (params: {
		type: SheetType;
		itemId?: string | null;
		data?: Record<string, unknown> | null;
	}) => void;
	setInitialItem: (item: ProductItem | null) => void;
	setInitialProduct: (product: FrontendProduct | null) => void;
	updateItemId: (itemId: string) => void;
	closeSheet: () => void;
	reset: () => void;
}

const initialState = {
	type: null as SheetType,
	previousType: null as SheetType,
	itemId: null as string | null,
	data: null as Record<string, unknown> | null,
	initialItem: null as ProductItem | null,
	initialProduct: null as FrontendProduct | null,
};

export const useSheetStore = create<SheetState>((set) => ({
	...initialState,

	setSheet: ({ type, itemId = null, data = null }) =>
		set((state) => ({
			previousType: state.type,
			type,
			itemId,
			data,
			initialItem: null,
			initialProduct: null,
		})),

	setInitialItem: (item) => set({ initialItem: item }),

	setInitialProduct: (product) => set({ initialProduct: product }),

	updateItemId: (itemId) => set({ itemId }),

	closeSheet: () =>
		set((state) => ({
			previousType: state.type,
			type: null,
			itemId: null,
			data: null,
			initialItem: null,
			initialProduct: null,
		})),

	reset: () => set(initialState),
}));

export const useIsSheetOpen = () => useSheetStore((s) => s.type !== null);
export const useIsAttachingProduct = () =>
	useSheetStore(
		(s) =>
			s.type === "attach-product" ||
			s.type === "attach-review" ||
			s.type === "attach-send-invoice" ||
			s.type === "attach-checkout-session" ||
			s.type === "attach-schedule-plan",
	);

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
				const isDialogOpen =
					document.querySelector('[role="dialog"]') ||
					document.querySelector('[data-state="open"][role="alertdialog"]') ||
					document.querySelector("dialog[open]");

				const isInlineEditorOpen = document.querySelector(
					"[data-inline-editor-open]",
				);

				if (!isDialogOpen && !isInlineEditorOpen) {
					if (onClose) {
						onClose();
					} else {
						closeSheet();
					}
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

export const useSheetCleanup = () => {
	const closeSheet = useSheetStore((s) => s.closeSheet);

	useEffect(() => {
		closeSheet();
	}, [closeSheet]);
};
