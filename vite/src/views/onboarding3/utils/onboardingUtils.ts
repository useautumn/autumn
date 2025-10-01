import { AppEnv } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import type { MutableRefObject } from "react";

export enum OnboardingStep {
	PlanDetails = "plan_details",
	FeatureCreation = "feature_creation",
	FeatureConfiguration = "feature_configuration",
	Playground = "playground",
	Completion = "completion",
}

// Helper to convert step enum to number for display
export const getStepNumber = (step: OnboardingStep): number => {
	const stepOrder = [
		OnboardingStep.PlanDetails,
		OnboardingStep.FeatureCreation,
		OnboardingStep.FeatureConfiguration,
		OnboardingStep.Playground,
		OnboardingStep.Completion,
	];
	return stepOrder.indexOf(step) + 1;
};

// Helper to get next step
export const getNextStep = (
	currentStep: OnboardingStep,
): OnboardingStep | null => {
	switch (currentStep) {
		case OnboardingStep.PlanDetails:
			return OnboardingStep.FeatureCreation;
		case OnboardingStep.FeatureCreation:
			return OnboardingStep.FeatureConfiguration;
		case OnboardingStep.FeatureConfiguration:
			return OnboardingStep.Playground;
		case OnboardingStep.Playground:
			return OnboardingStep.Completion;
		case OnboardingStep.Completion:
			return null;
		default:
			return null;
	}
};

// Step configuration for headers and descriptions
export const stepConfig = {
	[OnboardingStep.PlanDetails]: {
		title: "Create your first plan",
		description:
			"Think of products like pricing plans that can have a price or be free (eg. Starter plans). They include features that customers on this plan get access to.",
	},
	[OnboardingStep.FeatureCreation]: {
		title: "Create your first feature",
		description:
			"Create and add the first feature that customers on this plan get access to. One feature for each part of your app you want to gate based on pricing.",
	},
	[OnboardingStep.FeatureConfiguration]: {
		title: "Configure your feature",
		description:
			"Features can be free/included (100 credits per month), or have included usage with automatic overage pricing (100 credits included, $1 per credit after)",
	},
	[OnboardingStep.Playground]: {
		title: "Finish your setup",
		description: "Review and save your plan when ready",
	},
	[OnboardingStep.Completion]: {
		title: "Complete!",
		description: "Your plan has been created successfully",
	},
};

// Check if user needs state reset to prevent conflicts
export const checkForStateConflicts = (
	step: OnboardingStep,
	productCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>,
	baseProduct: any,
): boolean => {
	const currentStepNum = getStepNumber(step);
	const willGoToStep1 = currentStepNum === 2;

	if (!willGoToStep1) return false;

	const originalCreatedProductId = productCreatedRef.current.latestId;
	const currentProductId = baseProduct?.id;

	return (
		productCreatedRef.current.created &&
		originalCreatedProductId &&
		currentProductId &&
		originalCreatedProductId !== currentProductId
	);
};

// Create initial empty product state
export const createInitialProductState = (env?: string) => ({
	id: "",
	name: "",
	items: [],
	archived: false,
	created_at: Date.now(),
	is_add_on: false,
	is_default: false,
	version: 1,
	group: "",
	env: env || AppEnv.Sandbox,
	internal_id: "",
});

// Reset creation tracking refs
export const resetCreationTracking = (
	productCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>,
	featureCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>,
) => {
	productCreatedRef.current = { created: false, latestId: null };
	featureCreatedRef.current = { created: false, latestId: null };
};

// Handle back navigation logic
export const handleBackNavigation = (
	step: OnboardingStep,
	productCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>,
	featureCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>,
	baseProduct: any,
	setBaseProduct: (product: any) => void,
	setSelectedProductId: (id: string) => void,
) => {
	const isInConflictState = checkForStateConflicts(
		step,
		productCreatedRef,
		baseProduct,
	);

	console.log("[OnboardingView3] Going back to Step 1:", {
		isInConflictState,
		originalCreatedProductId: productCreatedRef.current.latestId,
		currentProductId: baseProduct?.id,
		productWasCreated: productCreatedRef.current.created,
	});

	if (isInConflictState) {
		console.log(
			"[OnboardingView3] Conflict detected - resetting to prevent constraint violations",
		);

		resetCreationTracking(productCreatedRef, featureCreatedRef);

		const initialProduct = createInitialProductState(baseProduct.env);
		setBaseProduct(initialProduct);
		setSelectedProductId("");
	}
};

// Handle plan selection logic
export const handlePlanSelection = async (
	planId: string,
	selectedProductId: string,
	baseProduct: any,
	setBaseProduct: (product: any) => void,
	setSelectedProductId: (id: string) => void,
	setSheet: (sheet: string) => void,
	setEditingState: (state: any) => void,
) => {
	if (!planId || planId === selectedProductId) return;

	console.log("[OnboardingView3] handlePlanSelect:", {
		planId,
		selectedProductId,
	});

	try {
		const updatedBaseProduct = { ...baseProduct, id: planId };
		console.log("[OnboardingView3] Setting base product with new ID:", planId);

		setBaseProduct(updatedBaseProduct);
		setSelectedProductId(planId);
		setSheet("edit-plan");
		setEditingState({ type: "plan", id: null });
	} catch (error) {
		console.error("Failed to load selected plan:", error);
		throw error;
	}
};

// Handle create plan dialog success
export const handleCreatePlanSuccess = async (
	newProduct: any,
	axiosInstance: AxiosInstance,
	setBaseProduct: (product: any) => void,
	setSelectedProductId: (id: string) => void,
	setSheet: (sheet: string) => void,
	setEditingState: (state: any) => void,
	refetchProducts: () => Promise<void>,
) => {
	const response = await axiosInstance.get(`/products/${newProduct.id}/data2`);
	const productData = response.data.product;

	setBaseProduct(productData);
	setSelectedProductId(newProduct.id);
	setSheet("edit-plan");
	setEditingState({ type: "plan", id: null });

	await refetchProducts();
};
