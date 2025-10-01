import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { usePlanData } from "../../products/plan/hooks/usePlanData";
import {
	getNextStep,
	handleBackNavigation,
	handleCreatePlanSuccess,
	handlePlanSelection,
	OnboardingStep,
} from "../utils/onboardingUtils";
import { useOnboardingActions } from "./useOnboardingActions";
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
		setBaseProduct: originalSetBaseProduct,
		feature,
		setFeature,
		productCreatedRef,
		featureCreatedRef,
	} = useOnboardingState();

	// Wrap setBaseProduct to log changes
	const setBaseProduct = (newProduct: any) => {
		console.log("[OnboardingView3] setBaseProduct called with:", {
			id: newProduct?.id,
			items: newProduct?.items?.length || 0,
		});
		originalSetBaseProduct(newProduct);
	};

	// HYBRID APPROACH: Use React Query when we have a product ID (Steps 2-4)
	const hasProductId = Boolean(baseProduct?.id && baseProduct.id !== "");

	const productQueryFetcher = async () => {
		if (!hasProductId) return null;
		const response = await axiosInstance.get(
			`/products/${baseProduct.id}/data2`,
		);
		return response.data;
	};

	const { data: queryData, refetch: refetchProduct } = useQuery({
		queryKey: ["onboarding-product", baseProduct?.id],
		queryFn: productQueryFetcher,
		enabled: hasProductId,
	});

	// Choose data source: React Query (Steps 2-4) or custom state (Step 1)
	const originalProduct = hasProductId
		? queryData?.product || baseProduct
		: baseProduct;

	console.log("[OnboardingView3] Data source:", {
		hasProductId,
		usingQuery: hasProductId,
		originalProductId: originalProduct?.id,
		baseProductId: baseProduct?.id,
		queryDataExists: !!queryData?.product,
		queryProductId: queryData?.product?.id,
	});

	const { product, setProduct, diff } = usePlanData({ originalProduct });
	const { step, pushStep, popStep, validateStep } = useOnboardingSteps();
	const { createProduct, createFeature, createProductItem } =
		useOnboardingActions({
			axiosInstance,
			productCreatedRef,
			featureCreatedRef,
		});

	// UI State
	const [sheet, setSheet] = useState<string | null>(null);
	const [editingState, setEditingState] = useState<{
		type: "plan" | "feature" | null;
		id: string | null;
	}>({ type: null, id: null });
	const [selectedProductId, setSelectedProductId] = useState<string>("");

	// Sync selectedProductId with product ID
	useMemo(() => {
		if (product?.id && selectedProductId !== product.id) {
			setSelectedProductId(product.id);
		}
	}, [product?.id, selectedProductId]);

	// Navigation handlers
	const handleNext = async () => {
		if (!validateStep(step, product, feature)) return;

		const nextStep = getNextStep(step);

		// Step 1→2: Create product
		if (step === OnboardingStep.PlanDetails) {
			const createdProduct = await createProduct(product);
			if (!createdProduct) return;
			setBaseProduct(createdProduct);
		}

		// Step 2→3: Create feature, ProductItem, and add to product immediately
		if (step === OnboardingStep.FeatureCreation) {
			const createdFeature = await createFeature(feature);
			if (!createdFeature) return;

			await refetch(); // Refresh features list

			// Create ProductItem and add to product immediately for live editing
			const newItem = createProductItem(createdFeature);
			setFeature(createdFeature);

			// Add or update item in product
			if (product && "items" in product) {
				const existingItems = product.items || [];
				const hasFeatureItem = existingItems.length > 0;

				if (hasFeatureItem) {
					// Update existing item's feature_id to match the updated feature
					setProduct({
						...product,
						items: existingItems.map((item, index) =>
							index === existingItems.length - 1
								? { ...item, feature_id: createdFeature.id }
								: item,
						),
					});
				} else {
					// First time: add new item
					setProduct({
						...product,
						items: [...existingItems, newItem],
					});
				}
			}
		}

		// Step 3→4: Just set up playground view
		if (
			step === OnboardingStep.FeatureConfiguration &&
			nextStep === OnboardingStep.Playground
		) {
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
			);
		} catch (error) {
			setSelectedProductId(product?.id || "");
		}
	};

	const onCreatePlanSuccess = async (newProduct: any) => {
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
		if (hasProductId) {
			// Use React Query refetch for Steps 2-4
			await refetchProduct();
		} else {
			// For Step 1, fetch the complete product manually
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
