import type { CreateFeature, Feature } from "@autumn/shared";
import { create } from "zustand";
import { getDefaultFeature } from "@/views/products/features/utils/defaultFeature";

interface FeatureState {
	feature: CreateFeature;
	baseFeature: Feature | null;
	setFeature: (feature: CreateFeature | ((prev: CreateFeature) => CreateFeature)) => void;
	setBaseFeature: (feature: Feature | null) => void;
	reset: () => void;
}

const initialState = {
	feature: getDefaultFeature(),
	baseFeature: null as Feature | null,
};

export const useFeatureStore = create<FeatureState>((set) => ({
	...initialState,
	setFeature: (feature) => {
		if (typeof feature === "function") {
			// Handle updater function pattern: setFeature(prev => newFeature)
			set((state) => ({ feature: feature(state.feature) }));
		} else {
			// Handle direct value: setFeature(newFeature)
			set({ feature });
		}
	},
	setBaseFeature: (baseFeature) => set({ baseFeature }),
	reset: () => set(initialState),
}));
