import { create } from "zustand";

interface VariantViewState {
	showAllVariants: boolean;
	setShowAllVariants: (show: boolean) => void;
}

export const useVariantViewStore = create<VariantViewState>((set) => ({
	showAllVariants: false,
	setShowAllVariants: (showAllVariants) => set({ showAllVariants }),
}));
