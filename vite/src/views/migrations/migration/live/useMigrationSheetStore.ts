import type { CustomerWithProducts } from "@autumn/shared";
import { create } from "zustand";

interface MigrationSheetState {
	selectedCustomer: CustomerWithProducts | null;
	setSelectedCustomer: (customer: CustomerWithProducts | null) => void;
}

export const useMigrationSheetStore = create<MigrationSheetState>((set) => ({
	selectedCustomer: null,
	setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),
}));
