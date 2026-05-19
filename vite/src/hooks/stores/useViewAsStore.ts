import { create } from "zustand";

type ViewAsState = {
	// The pinned historical main customer_product, by FullCusProduct.id.
	cusProductId: string | null;
	// The effective "now" for the simulation, in unix ms.
	asOfMs: number | null;
	// The pinned entity scope; null = customer-level pinned product.
	entityId: string | null;

	setViewAs: (args: {
		cusProductId: string;
		asOfMs: number;
		entityId: string | null;
	}) => void;
	clearViewAs: () => void;
};

export const useViewAsStore = create<ViewAsState>((set) => ({
	cusProductId: null,
	asOfMs: null,
	entityId: null,
	setViewAs: ({ cusProductId, asOfMs, entityId }) =>
		set({ cusProductId, asOfMs, entityId }),
	clearViewAs: () => set({ cusProductId: null, asOfMs: null, entityId: null }),
}));
