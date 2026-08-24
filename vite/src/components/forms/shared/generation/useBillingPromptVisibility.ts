import { create } from "zustand";

const STORAGE_KEY = "autumn.billing_prompt_bar_visible";

const readStoredVisibility = (): boolean => {
	try {
		return localStorage.getItem(STORAGE_KEY) !== "0";
	} catch {
		return true;
	}
};

type BillingPromptVisibilityState = {
	visible: boolean;
	setVisible: (visible: boolean) => void;
};

/** One preference shared by every billing sheet's AI prompt bar. */
export const useBillingPromptVisibility = create<BillingPromptVisibilityState>(
	(set) => ({
		setVisible: (visible) => {
			try {
				localStorage.setItem(STORAGE_KEY, visible ? "1" : "0");
			} catch {}
			set({ visible });
		},
		visible: readStoredVisibility(),
	}),
);
