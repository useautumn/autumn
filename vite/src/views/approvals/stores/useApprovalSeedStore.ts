import { create } from "zustand";
import { useSheetStore } from "@/hooks/stores/useSheetStore";

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

useSheetStore.subscribe((state, previous) => {
	if (previous.type && !state.type) {
		useApprovalSeedStore.getState().clearApprovalId();
	}
});
