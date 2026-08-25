import { create } from "zustand";

type BillingPromptVisibilityState = {
	visible: boolean;
	setVisible: (visible: boolean) => void;
};

/** One preference shared by every billing sheet's AI prompt bar. */
export const useBillingPromptVisibility = create<BillingPromptVisibilityState>(
	(set) => ({
		setVisible: (visible) => set({ visible }),
		visible: false,
	}),
);
