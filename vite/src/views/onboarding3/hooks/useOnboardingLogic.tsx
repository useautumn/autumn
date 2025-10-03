import type { ProductV2 } from "@autumn/shared";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { usePlanData } from "../../products/plan/hooks/usePlanData";
import {
	createFeature,
	createProduct,
	createProductItem,
	getNextStep,
	handleBackNavigation,
	handleCreatePlanSuccess,
	handlePlanSelection,
	OnboardingStep,
} from "../utils/onboardingUtils";
import { useOnboardingState } from "./useOnboardingState";
import { useOnboardingSteps } from "./useOnboardingSteps";

export const useOnboardingLogic = () => {
	const navigate = useNavigate();
	const env = useEnv();
	const axiosInstance = useAxiosInstance();
	const { refetch } = useFeaturesQuery();
	const { products, refetch: refetchProducts } = useProductsQuery();

	const {
		baseProduct,
		setBaseProduct,
		feature,
		setFeature,
		productCreatedRef,
		featureCreatedRef,
	} = useOnboardingState();

	// Choose data source: Always use baseProduct during onboarding (user has unsaved changes)
	// Only merge server data after explicit refetch (e.g., after save)
	const originalProduct = baseProduct;

	const { product, setProduct, diff } = usePlanData({ originalProduct });
	const { step, pushStep, popStep, validateStep } = useOnboardingSteps();
	// Note: createProduct, createFeature, createProductItem are now imported as plain functions

	// UI State
	const [sheet, setSheet] = useState<string | null>(null);
	const [editingState, setEditingState] = useState<{
		type: "plan" | "feature" | null;
		id: string | null;
	}>({ type: null, id: null });
	const [selectedProductId, setSelectedProductId] = useState<string>("");
	const [playgroundMode, setPlaygroundMode] = useState<"edit" | "preview">(
		"edit",
	);

	// Sync selectedProductId with product ID
	useMemo(() => {
		if (product?.id && selectedProductId !== product.id) {
			setSelectedProductId(product.id);
		}
	}, [product?.id, selectedProductId]);

	// Auto-open edit-plan sheet when entering step 4 (Playground)
	// Clear sheet when entering step 5 (Completion)
	useEffect(() => {
		if (step === OnboardingStep.Playground) {
			setSheet("edit-plan");
			setEditingState({ type: "plan", id: null });
		} else if (step === OnboardingStep.Completion) {
			setSheet(null);
			setEditingState({ type: null, id: null });
		}
	}, [step]);

	// Navigation handlers
	const handleNext = async () => {
		if (!validateStep(step, product, feature)) return;

		const nextStep = getNextStep(step);

		// Step 1→2: Create product
		if (step === OnboardingStep.PlanDetails) {
			const createdProduct = await createProduct(
				product,
				axiosInstance,
				productCreatedRef,
			);
			if (!createdProduct) return;
			setBaseProduct(createdProduct);
		}

		// Step 2→3: Create feature, ProductItem, and add to product immediately
		if (step === OnboardingStep.FeatureCreation) {
			const createdFeature = await createFeature(
				feature,
				axiosInstance,
				featureCreatedRef,
			);
			if (!createdFeature) return;

			await refetch(); // Refresh features list

			// Create ProductItem and add to product immediately for live editing
			const newItem = createProductItem(createdFeature);
			setFeature(createdFeature);

			// Add or update item in product
			if (product && "items" in product) {
				const existingItems = product.items || [];
				const hasFeatureItem = existingItems.length > 0;

				const updatedProduct = hasFeatureItem
					? {
							...product,
							items: existingItems.map((item, index) =>
								index === existingItems.length - 1
									? { ...item, feature_id: createdFeature.id }
									: item,
							),
						}
					: {
							...product,
							items: [...existingItems, newItem],
						};

				// Update local state (don't save yet - item needs configuration in step 3)
				setProduct(updatedProduct);
				setBaseProduct(updatedProduct);
			}
		}

		// Step 3→4: Save product changes before moving to playground
		if (
			step === OnboardingStep.FeatureConfiguration &&
			nextStep === OnboardingStep.Playground
		) {
			// Only save if there are changes
			if (diff.hasChanges) {
				const { updateProduct } = await import(
					"../../products/product/utils/updateProduct"
				);
				const saved = await updateProduct({
					axiosInstance,
					product: product as ProductV2,
					onSuccess: async () => {
						await handleRefetch();
					},
				});

				if (!saved) return; // Don't proceed if save failed
			}

			setSheet("edit-plan");
			setEditingState({ type: "plan", id: null });
		}

		if (nextStep) {
			pushStep(nextStep);
		} else {
			// Finish onboarding
			navigateTo("/products", navigate, env);
		}
	};

	const handleBack = () => {
		setSheet(null);
		setEditingState({ type: null, id: null });

		handleBackNavigation(
			step,
			productCreatedRef,
			featureCreatedRef,
			baseProduct,
			setBaseProduct,
			setSelectedProductId,
		);

		popStep();
	};

	const handlePlanSelect = async (planId: string) => {
		try {
			await handlePlanSelection(
				planId,
				selectedProductId,
				baseProduct,
				setBaseProduct,
				setSelectedProductId,
				setSheet,
				setEditingState,
				axiosInstance,
			);
		} catch (_) {
			setSelectedProductId(product?.id || "");
		}
	};

	const onCreatePlanSuccess = async (newProduct: ProductV2) => {
		try {
			await handleCreatePlanSuccess(
				newProduct,
				axiosInstance,
				setBaseProduct,
				setSelectedProductId,
				setSheet,
				setEditingState,
				refetchProducts,
			);
		} catch (error) {
			console.error("Failed to load new plan:", error);
			navigateTo(`/products/${newProduct.id}`, navigate, env);
		}
	};

	// Create a unified refetch function for SaveChangesBar
	const handleRefetch = async () => {
		if (product?.id) {
			try {
				const response = await axiosInstance.get(
					`/products/${product.id}/data2`,
				);
				setBaseProduct(response.data.product);
			} catch (error) {
				console.error("Failed to refetch product:", error);
			}
		}
	};

	return {
		// Data
		product,
		setProduct,
		diff,
		baseProduct,
		feature,
		setFeature,
		step,
		products,
		selectedProductId,

		// UI State
		sheet,
		setSheet,
		editingState,
		setEditingState,
		playgroundMode,
		setPlaygroundMode,

		// Handlers
		handleNext,
		handleBack,
		handlePlanSelect,
		onCreatePlanSuccess,
		handleRefetch,

		// Utils
		validateStep,
		navigate,
		env,
	};
};
