import type { CreateFeature, Feature, ProductV2 } from "@autumn/shared";
import { create } from "zustand";
import type { OnboardingStep } from "../utils/onboardingUtils";

// Types for the store
interface OnboardingState {
	// Flow state (step is now managed by query state)
	playgroundMode: "edit" | "preview";
	hasCompletedOnboarding: boolean;
	isOnboarding: boolean;

	// UI state
	isButtonLoading: boolean;
	lastUsedProductId: string | undefined;

	// Action handlers (set by initialization hooks)
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

	// Actions - Flow (step is managed by query state, not here)
	setPlaygroundMode: (mode: "edit" | "preview") => void;
	setHasCompletedOnboarding: (completed: boolean) => void;
	setIsOnboarding: (isOnboarding: boolean) => void;

	// Actions - UI
	setIsButtonLoading: (loading: boolean) => void;
	setLastUsedProductId: (productId: string | undefined) => void;

	// Actions - Set handlers (called by initialization hooks)
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

	// Complex actions
	reset: () => void;
}

// Initial state factory
const createInitialState = () => ({
	// Flow (step is now managed by query state)
	playgroundMode: "edit" as const,
	hasCompletedOnboarding: false,
	isOnboarding: false,

	// UI
	isButtonLoading: false,
	lastUsedProductId: undefined as string | undefined,

	// Action handlers (initialized by hooks)
	handleNext: null as (() => void) | null,
	handleBack: null as (() => void) | null,
	handlePlanSelect: null as (() => void) | null,
	onCreatePlanSuccess: null as (() => void) | null,
	handleDeletePlanSuccess: null as (() => void) | null,
	validateStep: null as OnboardingState["validateStep"],
});

export const useOnboardingStore = create<OnboardingState>((set) => ({
	...createInitialState(),

	// Flow actions (step is managed by query state)
	setPlaygroundMode: (playgroundMode) => set({ playgroundMode }),
	setHasCompletedOnboarding: (hasCompletedOnboarding) =>
		set({ hasCompletedOnboarding }),
	setIsOnboarding: (isOnboarding) => set({ isOnboarding }),

	// UI actions
	setIsButtonLoading: (isButtonLoading) => set({ isButtonLoading }),
	setLastUsedProductId: (lastUsedProductId) => set({ lastUsedProductId }),

	// Set action handlers (called by initialization hooks)
	setHandleNext: (handleNext) => set({ handleNext }),
	setHandleBack: (handleBack) => set({ handleBack }),
	setHandlePlanSelect: (handlePlanSelect) => set({ handlePlanSelect }),
	setOnCreatePlanSuccess: (onCreatePlanSuccess) => set({ onCreatePlanSuccess }),
	setHandleDeletePlanSuccess: (handleDeletePlanSuccess) =>
		set({ handleDeletePlanSuccess }),
	setValidateStep: (validateStep) => set({ validateStep }),

	// Complex actions
	reset: () => set(createInitialState()),
}));
