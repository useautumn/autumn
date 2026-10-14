/** biome-ignore-all lint/suspicious/noExplicitAny: needed */
import {
	AppEnv,
	type CreateFeature,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type ProductItem,
	ProductItemFeatureType,
	ProductItemInterval,
	type ProductV2,
} from "@autumn/shared";
import type { AxiosError, AxiosInstance } from "axios";
import type { MutableRefObject } from "react";
import { toast } from "sonner";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";

export enum OnboardingStep {
	PlanDetails = "plan_details",
	FeatureCreation = "feature_creation",
	FeatureConfiguration = "feature_configuration",
	Playground = "playground",
	Integration = "integration",
}

const getStepNumber = (step: OnboardingStep): number => {
	const stepOrder = [
		OnboardingStep.PlanDetails,
		OnboardingStep.FeatureCreation,
		OnboardingStep.FeatureConfiguration,
		OnboardingStep.Playground,
		OnboardingStep.Integration,
	];
	return stepOrder.indexOf(step) + 1;
};

const getNextStep = (currentStep: OnboardingStep): OnboardingStep | null => {
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

const stepConfig = {
	[OnboardingStep.PlanDetails]: {
		title: "Create your first Plan",
		description:
			"Create the first plan your app offers. You can create both free and paid tiers.",
	},
	[OnboardingStep.FeatureCreation]: {
		title: "Create a Feature",
		description:
			"Features are what customers get access to with this plan. Create features for things you want to limit, track or bill for.",
	},
	[OnboardingStep.FeatureConfiguration]: {
		title: "Configure Plan Limits and Pricing",
		description:
			"Set a limit for how much the feature can be used, or charge a usage-based price for it.",
	},
	[OnboardingStep.Playground]: {
		title: "Add more Features and Plans",
		description:
			"Take your time setting up plans and features. Revisit anytime. Use Preview Mode to test features, limits and upgrade/downgrade flows.",
	},
	[OnboardingStep.Integration]: {
		title: "Integrate",
		description:
			"Let's integrate Autumn and get your first customer onto one of your plans",
	},
};

const checkForStateConflicts = (
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

const createInitialProductState = (env?: string) => ({
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

const resetCreationTracking = (
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

const handleBackNavigation = async (
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
	axiosInstance?: AxiosInstance,
) => {};

const handlePlanSelection = async (
	planId: string,
	selectedProductId: string,
	_baseProduct: any,
	setBaseProduct: (product: any) => void,
	setProduct: (product: any) => void,
	setSelectedProductId: (id: string) => void,
	setSheet: (params: { type: any; itemId?: string | null }) => void,
	axiosInstance: AxiosInstance,
) => {
	if (!planId || planId === selectedProductId) return;

	try {
		const response = await axiosInstance.get(`/products/${planId}/data2`);
		const productData = response.data.product;

		setBaseProduct(productData);
		setProduct(productData);
		setSelectedProductId(planId);
		setSheet({ type: "edit-plan" });
	} catch (error) {
		console.error("Failed to load selected plan:", error);
		throw error;
	}
};

const handleCreatePlanSuccess = async (
	newProduct: any,
	axiosInstance: AxiosInstance,
	setBaseProduct: (product: any) => void,
	setSelectedProductId: (id: string) => void,
	setSheet: (params: { type: any; itemId?: string | null }) => void,
	refetchProducts: () => Promise<void>,
) => {
	await refetchProducts();

	const response = await axiosInstance.get(`/products/${newProduct.id}/data2`);
	const productData = response.data.product;

	setSelectedProductId(newProduct.id);

	setBaseProduct(productData);

	setSheet({ type: "edit-plan" });
};

const createProduct = async (product: any, axiosInstance: AxiosInstance) => {
	try {
		const createdProduct: Awaited<
			ReturnType<typeof ProductService.createProduct>
		> = await ProductService.createProduct(axiosInstance, product);

		toast.success(`Plan "${product?.name}" created successfully!`);

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

const createProductItem = (createdFeature: CreateFeature) => {
	let featureType: ProductItemFeatureType;

	if (createdFeature.type === FeatureType.Boolean) {
		featureType = ProductItemFeatureType.Static;
	} else if (createdFeature.type === FeatureType.CreditSystem) {
		featureType = ProductItemFeatureType.SingleUse;
	} else if (
		createdFeature.type === FeatureType.Metered ||
		createdFeature.type === "metered"
	) {
		const usageType = createdFeature.config?.usage_type;
		if (usageType === FeatureUsageType.Single || usageType === "single_use") {
			featureType = ProductItemFeatureType.SingleUse;
		} else if (
			usageType === FeatureUsageType.Continuous ||
			usageType === "continuous_use"
		) {
			featureType = ProductItemFeatureType.ContinuousUse;
		} else {
			featureType = ProductItemFeatureType.SingleUse;
		}
	} else {
		featureType = ProductItemFeatureType.SingleUse;
	}

	if (createdFeature.type === FeatureType.Boolean) {
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

	const isContinuousUse = featureType === ProductItemFeatureType.ContinuousUse;

	return {
		feature_id: createdFeature.id,
		feature_type: featureType,
		included_usage: 0,
		interval: isContinuousUse ? null : ProductItemInterval.Month,
		price: null,
		tiers: null,
		billing_units: 1,
		entity_feature_id: null,
		reset_usage_when_enabled: !isContinuousUse,
	};
};

const findNextClosestProduct = (
	deletedProductId: string,
	products: any[],
	currentSelectedId?: string,
): string | null => {
	const availableProducts = products.filter(
		(p) => !p.archived && p.id !== deletedProductId,
	);

	if (availableProducts.length === 0) {
		return null;
	}

	if (currentSelectedId && currentSelectedId !== deletedProductId) {
		const currentStillExists = availableProducts.find(
			(p) => p.id === currentSelectedId,
		);
		if (currentStillExists) {
			return currentSelectedId;
		}
	}

	const sortedProducts = availableProducts.sort((a, b) => {
		const aTime = new Date(a.created_at || 0).getTime();
		const bTime = new Date(b.created_at || 0).getTime();
		return bTime - aTime;
	});

	return sortedProducts[0]?.id || null;
};

const syncProductItemsWithFeature = (
	product: ProductV2,
	updatedFeature: CreateFeature | Feature,
): ProductV2 => {
	if (!product.items || !updatedFeature.id) return product;

	const updatedItems = product.items.map((item: ProductItem) => {
		if (item.feature_id !== updatedFeature.id) return item;

		const tempItem = createProductItem(updatedFeature);

		return {
			...item,
			feature_type: tempItem.feature_type,
		};
	});

	return {
		...product,
		items: updatedItems,
	};
};

const getBaseProduct = (
	products: ProductV2[] | undefined,
	baseProductId: string | null,
): ProductV2 | null => {
	if (!products || !baseProductId) return null;
	return products.find((p) => p.id === baseProductId) || null;
};

const getBaseFeature = (
	features: (Feature | CreateFeature)[] | undefined,
	baseFeatureId: string | null,
): Feature | CreateFeature | null => {
	if (!features || !baseFeatureId) return null;
	return features.find((f) => f.id === baseFeatureId) || null;
};
