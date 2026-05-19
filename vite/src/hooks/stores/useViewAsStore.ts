import { create } from "zustand";

type ViewAsState = {
	// The pinned historical main customer_product, by FullCusProduct.id.
	cusProductId: string | null;
	// The effective "now" for the simulation, in unix ms.
	asOfMs: number | null;

	setViewAs: (args: { cusProductId: string; asOfMs: number }) => void;
	clearViewAs: () => void;
};

export const useViewAsStore = create<ViewAsState>((set) => ({
	cusProductId: null,
	asOfMs: null,
	setViewAs: ({ cusProductId, asOfMs }) => set({ cusProductId, asOfMs }),
	clearViewAs: () => set({ cusProductId: null, asOfMs: null }),
}));
