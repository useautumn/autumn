/** biome-ignore-all lint/suspicious/noExplicitAny: needed */
import {
	AppEnv,
	type CreateFeature,
	CreateFeatureSchema,
	CreateProductSchema,
	ProductItemInterval,
} from "@autumn/shared";
import type { AxiosError, AxiosInstance } from "axios";
import type { MutableRefObject } from "react";
import { toast } from "sonner";
import { FeatureService } from "@/services/FeatureService";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";

export enum OnboardingStep {
	PlanDetails = "plan_details",
	FeatureCreation = "feature_creation",
	FeatureConfiguration = "feature_configuration",
	Playground = "playground",
	Integration = "integration",
}

// Helper to convert step enum to number for display
export const getStepNumber = (step: OnboardingStep): number => {
	const stepOrder = [
		OnboardingStep.PlanDetails,
		OnboardingStep.FeatureCreation,
		OnboardingStep.FeatureConfiguration,
		OnboardingStep.Playground,
		OnboardingStep.Integration,
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
			return OnboardingStep.Integration;
		case OnboardingStep.Integration:
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
		description:
			"Take your time setting up plans and features. Revisit anytime. Use Preview Mode to test features, limits and upgrade/downgrade flows.",
	},
	[OnboardingStep.Integration]: {
		title: "Integrate",
		description:
			"Let's integrate Autumn and get your first customer onto one of your plans",
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

	if (isInConflictState) {
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
	_baseProduct: any,
	setBaseProduct: (product: any) => void,
	setSelectedProductId: (id: string) => void,
	setSheet: (sheet: string) => void,
	setEditingState: (state: any) => void,
	axiosInstance: AxiosInstance,
) => {
	if (!planId || planId === selectedProductId) return;

	try {
		// Fetch the actual product data from the server to avoid stale state
		const response = await axiosInstance.get(`/products/${planId}/data2`);
		const productData = response.data.product;

		setBaseProduct(productData);
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

// Product creation helper
export const createProduct = async (
	product: any,
	axiosInstance: AxiosInstance,
	productCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>,
) => {
	try {
		const result = CreateProductSchema.safeParse({
			name: product?.name,
			id: product?.id,
			items: product?.items || [],
		});

		if (result.error) {
			console.error("Product validation error:", result.error);
			toast.error("Invalid product data");
			return null;
		}

		let createdProduct: Awaited<
			ReturnType<typeof ProductService.createProduct>
		>;

		if (!productCreatedRef.current.created) {
			// First time creating the product
			createdProduct = await ProductService.createProduct(
				axiosInstance,
				result.data,
			);
			productCreatedRef.current = {
				created: true,
				latestId: createdProduct.id,
			};
			toast.success(`Product "${product?.name}" created successfully!`);
		} else {
			// Product already exists, update it (supports ID changes)
			// Note: Backend creates a new product if ID changed, archives old one
			await ProductService.updateProduct(
				axiosInstance,
				productCreatedRef.current.latestId as string,
				result.data,
			);
			// Fetch the full product after update (same as PlanEditorView does)
			const response = await axiosInstance.get(
				`/products/${result.data.id}/data2`,
			);
			createdProduct = response.data.product;

			productCreatedRef.current.latestId = result.data.id;
			toast.success(`Product "${product?.name}" updated successfully!`);
		}

		return {
			...createdProduct,
			items: product?.items || createdProduct.items || [],
		};
	} catch (error: unknown) {
		console.error("Failed to create/update product:", error);
		toast.error(
			getBackendErr(error as AxiosError, "Failed to create/update product"),
		);
		return null;
	}
};

// Feature creation helper
export const createFeature = async (
	feature: CreateFeature,
	axiosInstance: AxiosInstance,
	featureCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>,
) => {
	const result = CreateFeatureSchema.safeParse(feature);
	if (result.error) {
		toast.error("Invalid feature", {
			description: result.error.issues.map((x) => x.message).join(".\n"),
		});
		return null;
	}

	try {
		let newFeature: any;

		if (!featureCreatedRef.current.created) {
			// First time creating the feature
			const { data } = await FeatureService.createFeature(axiosInstance, {
				name: feature.name,
				id: feature.id,
				type: feature.type,
				config: feature.config,
			});
			newFeature = data;
			featureCreatedRef.current = {
				created: true,
				latestId: data.id,
			};
			toast.success(`Feature "${feature.name}" created successfully!`);
		} else {
			// Feature already exists, update it (supports ID changes)
			const { data } = await FeatureService.updateFeature(
				axiosInstance,
				featureCreatedRef.current.latestId as string,
				{
					name: feature.name,
					id: feature.id,
					type: feature.type,
					config: feature.config,
				},
			);
			newFeature = data;
			featureCreatedRef.current.latestId = data.id;
			toast.success(`Feature "${feature.name}" updated successfully!`);
		}

		if (!newFeature?.id) return null;

		return newFeature;
	} catch (error: unknown) {
		toast.error(
			getBackendErr(error as AxiosError, "Failed to create/update feature"),
		);
		return null;
	}
};

// Product item creation helper
export const createProductItem = (createdFeature: CreateFeature) => {
	// Map feature type to product item feature type
	let featureType = null;
	if (createdFeature.type === "boolean") {
		featureType = "static";
	} else if (createdFeature.type === "credit_system") {
		featureType = "single_use";
	} else if (createdFeature.type === "metered") {
		// For metered features, use the usage_type from config
		// This ensures compatibility with existing features during resumption
		featureType = createdFeature.config?.usage_type || "single_use";
	}

	// Boolean features have a simplified structure with no pricing/billing properties
	if (createdFeature.type === "boolean") {
		return {
			feature_id: createdFeature.id,
			feature_type: featureType,
			included_usage: null,
			interval: null,
			price: null,
			tiers: null,
			billing_units: null,
			entity_feature_id: null,
			reset_usage_when_enabled: null,
		};
	}

	// Non-boolean features start in "included" billing type by default
	// User can switch to "priced" in step 3 if needed
	return {
		feature_id: createdFeature.id,
		feature_type: featureType,
		included_usage: 0,
		interval: ProductItemInterval.Month,
		price: null,
		tiers: null,
		billing_units: 1,
		entity_feature_id: null,
		reset_usage_when_enabled: true,
	};
};

// Find next closest non-deleted product when a product is deleted
export const findNextClosestProduct = (
	deletedProductId: string,
	products: any[],
	currentSelectedId?: string,
): string | null => {
	// Filter out deleted/archived products
	const availableProducts = products.filter(
		(p) => !p.archived && p.id !== deletedProductId,
	);

	if (availableProducts.length === 0) {
		return null;
	}

	// If the deleted product wasn't the currently selected one, keep current selection
	if (currentSelectedId && currentSelectedId !== deletedProductId) {
		const currentStillExists = availableProducts.find(
			(p) => p.id === currentSelectedId,
		);
		if (currentStillExists) {
			return currentSelectedId;
		}
	}

	// Sort by creation date (newest first) to get the most recently created product
	const sortedProducts = availableProducts.sort((a, b) => {
		const aTime = new Date(a.created_at || 0).getTime();
		const bTime = new Date(b.created_at || 0).getTime();
		return bTime - aTime;
	});

	return sortedProducts[0]?.id || null;
};
