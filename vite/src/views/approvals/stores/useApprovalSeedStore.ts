import { create } from "zustand";
import { useSheetStore } from "@/hooks/stores/useSheetStore";

/** The deep-linked approval outlives sheet stage transitions (which rebuild
 * the sheet store's `data`), so the id lives here until the sheet closes. */
type ApprovalSeedState = {
	approvalId: string | null;
	clearApprovalId: () => void;
	setApprovalId: (approvalId: string | null) => void;
};

export const useApprovalSeedStore = create<ApprovalSeedState>((set) => ({
	approvalId: null,
	clearApprovalId: () => set({ approvalId: null }),
	setApprovalId: (approvalId) => set({ approvalId }),
}));

// A real close drops the seed; sheet swaps and stage changes keep it.
useSheetStore.subscribe((state, previous) => {
	if (previous.type && !state.type) {
		useApprovalSeedStore.getState().clearApprovalId();
	}
});
