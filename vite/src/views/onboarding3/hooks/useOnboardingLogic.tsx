import type { ProductV2 } from "@autumn/shared";
import { isPriceItem } from "@autumn/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { usePlanData } from "../../products/plan/hooks/usePlanData";
import {
	createFeature,
	createInitialProductState,
	createProduct,
	createProductItem,
	findNextClosestProduct,
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

	const { refetch, features, isLoading: featuresLoading } = useFeaturesQuery();
	const {
		products,
		isLoading: productsLoading,
		refetch: refetchProducts,
	} = useProductsQuery();

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

	const handlePlanSelect = useCallback(
		async (planId: string) => {
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
		},
		[
			selectedProductId,
			baseProduct,
			setBaseProduct,
			axiosInstance,
			product?.id,
		],
	);

	// Handle product deletion/archival - auto-select next closest product
	useEffect(() => {
		if (!selectedProductId || !products || products.length === 0) {
			return;
		}

		// Check if currently selected product is deleted/archived
		const selectedProduct = products.find((p) => p.id === selectedProductId);
		const isSelectedDeleted = !selectedProduct || selectedProduct.archived;

		if (isSelectedDeleted) {
			const nextProductId = findNextClosestProduct(
				selectedProductId,
				products,
				selectedProductId,
			);

			if (nextProductId) {
				// Auto-select next closest product and load its data
				handlePlanSelect(nextProductId);
			} else {
				// No products available - reset to empty state
				setSelectedProductId("");
				setBaseProduct(createInitialProductState() as ProductV2);
			}
		}
	}, [products, selectedProductId, handlePlanSelect, setBaseProduct]);

	// Auto-skip to step 4 in preview mode when user has completed onboarding
	const onboardingProcessed = useRef(false);
	useEffect(() => {
		// Only process once, and only after we have actual data
		if (onboardingProcessed.current) {
			return;
		}

		// Wait for both queries to complete loading
		if (productsLoading || featuresLoading) {
			return;
		}

		// Additional safety: ensure arrays are defined
		if (products === undefined || features === undefined) {
			return;
		}

		// Check if user has completed onboarding (has at least 1 product and 1 feature)
		const hasCompletedOnboarding =
			(products?.length ?? 0) >= 1 && (features?.length ?? 0) >= 1;

		if (hasCompletedOnboarding) {
			// Auto-skip to step 4 (Playground) in preview mode
			if (products && products.length > 0) {
				const firstProduct = products[0];

				// Fetch full product data
				axiosInstance
					.get(`/products/${firstProduct.id}/data2`)
					.then((response) => {
						const productData = response.data.product;
						setBaseProduct(productData);

						// Jump directly to step 4 (Playground) in preview mode
						pushStep(OnboardingStep.FeatureCreation);
						pushStep(OnboardingStep.FeatureConfiguration);
						pushStep(OnboardingStep.Playground);

						// Set to preview mode since user has completed onboarding
						setPlaygroundMode("preview");
					})
					.catch((error) => {
						console.error("Failed to load product:", error);
					});
			}
		}

		// Mark as processed regardless of whether we took action
		onboardingProcessed.current = true;
	}, [
		products,
		features,
		productsLoading,
		featuresLoading,
		pushStep,
		axiosInstance,
		setBaseProduct,
	]);

	// Auto-open edit-plan sheet when entering step 4 (Playground) in edit mode
	// Clear sheet when entering step 5 (Integration)
	useEffect(() => {
		if (step === OnboardingStep.Playground && playgroundMode === "edit") {
			setSheet("edit-plan");
			setEditingState({ type: "plan", id: null });
		} else if (step === OnboardingStep.Integration) {
			setSheet(null);
			setEditingState({ type: null, id: null });
		}
	}, [step, playgroundMode]);

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

			// Add feature item to product (preserving any existing base price item)
			if (product && "items" in product) {
				const existingItems = product.items || [];

				// Check if we already have a feature item (from previous onboarding attempts)
				// A feature item has feature_id but is not a price item (base price)
				const existingFeatureItemIndex = existingItems.findIndex(
					(item) => item.feature_id && !isPriceItem(item),
				);

				let updatedItems: typeof existingItems;

				if (existingFeatureItemIndex !== -1) {
					// Update existing feature item with new feature_id
					updatedItems = [...existingItems];
					updatedItems[existingFeatureItemIndex] = {
						...updatedItems[existingFeatureItemIndex],
						feature_id: createdFeature.id,
					};
				} else {
					// Add new feature item, preserving any existing base price items
					updatedItems = [...existingItems, newItem];
				}

				const updatedProduct = {
					...product,
					items: updatedItems,
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
			navigateTo("/sandbox/products", navigate, env);
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
