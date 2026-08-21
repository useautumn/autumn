import { create } from "zustand";

/** The deep-linked approval outlives sheet stage transitions, which rebuild
 * the sheet store's `data` — so the id lives here until the sheet unmounts. */
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
