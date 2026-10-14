import type { CreateFeature, Feature, ProductV2 } from "@autumn/shared";
import { create } from "zustand";
import type { OnboardingStep } from "../utils/onboardingUtils";

interface OnboardingState {
	playgroundMode: "edit" | "preview";
	hasCompletedOnboarding: boolean;
	isOnboarding: boolean;

	isButtonLoading: boolean;
	lastUsedProductId: string | undefined;

	handleNext: (() => void) | null;
	handleBack: (() => void) | null;
	handlePlanSelect: ((planId: string) => Promise<void>) | null;
	onCreatePlanSuccess: ((newProduct: ProductV2) => Promise<void>) | null;
	handleDeletePlanSuccess: (() => Promise<void>) | null;
	validateStep:
		| ((
				step: OnboardingStep,
				product: ProductV2 | undefined,
				feature: Feature | CreateFeature | null,
		  ) => boolean)
		| null;

	setPlaygroundMode: (mode: "edit" | "preview") => void;
	setHasCompletedOnboarding: (completed: boolean) => void;
	setIsOnboarding: (isOnboarding: boolean) => void;

	setIsButtonLoading: (loading: boolean) => void;
	setLastUsedProductId: (productId: string | undefined) => void;

	setHandleNext: (handler: () => void) => void;
	setHandleBack: (handler: () => void) => void;
	setHandlePlanSelect: (handler: (planId: string) => Promise<void>) => void;
	setOnCreatePlanSuccess: (
		handler: (newProduct: ProductV2) => Promise<void>,
	) => void;
	setHandleDeletePlanSuccess: (handler: () => Promise<void>) => void;
	setValidateStep: (
		validator: (
			step: OnboardingStep,
			product: ProductV2 | undefined,
			feature: Feature | CreateFeature | null,
		) => boolean,
	) => void;

	reset: () => void;
}

const createInitialState = () => ({
	playgroundMode: "edit" as const,
	hasCompletedOnboarding: false,
	isOnboarding: false,

	isButtonLoading: false,
	lastUsedProductId: undefined as string | undefined,

	handleNext: null as (() => void) | null,
	handleBack: null as (() => void) | null,
	handlePlanSelect: null as (() => void) | null,
	onCreatePlanSuccess: null as (() => void) | null,
	handleDeletePlanSuccess: null as (() => void) | null,
	validateStep: null as OnboardingState["validateStep"],
});

export const useOnboardingStore = create<OnboardingState>((set) => ({
	...createInitialState(),

	setPlaygroundMode: (playgroundMode) => set({ playgroundMode }),
	setHasCompletedOnboarding: (hasCompletedOnboarding) =>
		set({ hasCompletedOnboarding }),
	setIsOnboarding: (isOnboarding) => set({ isOnboarding }),

	setIsButtonLoading: (isButtonLoading) => set({ isButtonLoading }),
	setLastUsedProductId: (lastUsedProductId) => set({ lastUsedProductId }),

	setHandleNext: (handleNext) => set({ handleNext }),
	setHandleBack: (handleBack) => set({ handleBack }),
	setHandlePlanSelect: (handlePlanSelect) => set({ handlePlanSelect }),
	setOnCreatePlanSuccess: (onCreatePlanSuccess) => set({ onCreatePlanSuccess }),
	setHandleDeletePlanSuccess: (handleDeletePlanSuccess) =>
		set({ handleDeletePlanSuccess }),
	setValidateStep: (validateStep) => set({ validateStep }),

	reset: () => set(createInitialState()),
}));
