import type { CustomerWithProducts, Operations } from "@autumn/shared";
import { create } from "zustand";

interface MigrationSheetState {
	selectedCustomer: CustomerWithProducts | null;
	setSelectedCustomer: (customer: CustomerWithProducts | null) => void;
	liveFormState: { operations: Operations; noBillingChanges: boolean };
	setLiveFormState: (state: { operations: Operations; noBillingChanges: boolean }) => void;
}

export const useMigrationSheetStore = create<MigrationSheetState>((set) => ({
	selectedCustomer: null,
	setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),
	liveFormState: { operations: {}, noBillingChanges: false },
	setLiveFormState: (liveFormState) => set({ liveFormState }),
}));
