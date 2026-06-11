import type { Operations } from "@autumn/shared";
import { create } from "zustand";
import type { MigrationPreviewCustomer } from "@/hooks/queries/useMigrationFilterPreview";

interface MigrationSheetState {
	selectedCustomer: MigrationPreviewCustomer | null;
	setSelectedCustomer: (customer: MigrationPreviewCustomer | null) => void;
	liveFormState: { operations: Operations; noBillingChanges: boolean };
	setLiveFormState: (state: {
		operations: Operations;
		noBillingChanges: boolean;
	}) => void;
}

export const useMigrationSheetStore = create<MigrationSheetState>((set) => ({
	selectedCustomer: null,
	setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),
	liveFormState: { operations: {}, noBillingChanges: true },
	setLiveFormState: (liveFormState) => set({ liveFormState }),
}));
