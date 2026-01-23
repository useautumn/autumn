import { create } from "zustand";
import type { FrontendReward } from "@/views/products/rewards/types/frontendReward";
import { defaultDiscountConfig } from "@/views/products/rewards/utils/defaultRewardModels";

const DEFAULT_REWARD: FrontendReward = {
	name: "",
	id: "",
	promo_codes: [],
	rewardCategory: null,
	discountType: null,
	free_product_id: null,
	discount_config: defaultDiscountConfig,
	free_product_config: null,
};

interface RewardState {
	// The reward being edited (working copy)
	reward: FrontendReward;

	// The base/original reward (for comparison)
	baseReward: FrontendReward | null;

	// Actions
	setReward: (
		reward: FrontendReward | ((prev: FrontendReward) => FrontendReward),
	) => void;
	setBaseReward: (reward: FrontendReward | null) => void;
	reset: () => void;
}

const initialState = {
	reward: DEFAULT_REWARD,
	baseReward: null as FrontendReward | null,
};

export const useRewardStore = create<RewardState>((set) => ({
	...initialState,

	setReward: (reward) => {
		if (typeof reward === "function") {
			set((state) => ({ reward: reward(state.reward) }));
		} else {
			set({ reward });
		}
	},

	setBaseReward: (baseReward) => set({ baseReward }),

	reset: () => set(initialState),
}));
