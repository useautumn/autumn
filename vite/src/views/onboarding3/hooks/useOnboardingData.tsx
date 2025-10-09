import { useEffect, useMemo, useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { usePlanData } from "../../products/plan/hooks/usePlanData";
import { useOnboardingState } from "./useOnboardingState";

export const useOnboardingData = () => {
	const axiosInstance = useAxiosInstance();
	const {
		products,
		isLoading: productsLoading,
		refetch: refetchProducts,
	} = useProductsQuery();

	const {
		features,
		isLoading: featuresLoading,
		refetch: refetchFeatures,
	} = useFeaturesQuery();

	const {
		baseProduct,
		setBaseProduct,

		feature,
		setFeature,

		productCreatedRef,
		featureCreatedRef,
		isButtonLoading,
		setIsButtonLoading,
	} = useOnboardingState();

	const [selectedProductId, setSelectedProductId] = useState<string>("");

	// Use baseProduct as the original for plan data
	const originalProduct = baseProduct;
	const { product, setProduct, diff } = usePlanData({ originalProduct });

	// // Load product data by ID
	// const loadProductData = useCallback(
	// 	async (productId: string) => {
	// 		try {
	// 			const response = await axiosInstance.get(
	// 				`/products/${productId}/data2`,
	// 			);
	// 			setBaseProduct(response.data.product);
	// 			return response.data.product;
	// 		} catch (error) {
	// 			console.error("Failed to load product:", error);
	// 			return null;
	// 		}
	// 	},
	// 	[axiosInstance, setBaseProduct],
	// );

	// Initialize with first available product and feature on mount
	useEffect(() => {
		// Only run when queries have loaded
		if (!products || !features) return;

		// Load first product if available and not already set in ref
		if (products.length > 0 && !productCreatedRef.current.created) {
			const firstProduct = products[0];
			productCreatedRef.current = {
				created: true,
				latestId: firstProduct.id,
			};
			// loadProductData(firstProduct.id);

			setBaseProduct(firstProduct);
		}

		// Load first feature if available and not already set in ref
		if (features.length > 0 && !featureCreatedRef.current.created) {
			const firstFeature = features[0];
			featureCreatedRef.current = {
				created: true,
				latestId: firstFeature.id,
			};
			setFeature({
				...firstFeature,
				config: firstFeature.config || {},
			});
		}
	}, [
		products,
		features,
		productCreatedRef,
		featureCreatedRef,
		setFeature,
		setBaseProduct,
		// loadProductData,
	]);

	// Sync selectedProductId with product ID when it changes
	useEffect(() => {
		if (product?.id && selectedProductId !== product.id) {
			setSelectedProductId(product.id);
		}
	}, [product?.id, selectedProductId]);

	// // Initialize with first available product and feature for completed onboarding
	// const initializeWithExistingData = useCallback(async () => {
	// 	console.log("Features:", features);
	// 	console.log("Products:", products);
	// 	if (
	// 		!products ||
	// 		!features ||
	// 		products.length === 0 ||
	// 		features.length === 0
	// 	) {
	// 		return false;
	// 	}

	// 	const firstProduct = products[0];
	// 	const firstFeature = features[0];

	// 	// Mark as existing for resumability
	// 	productCreatedRef.current = {
	// 		created: true,
	// 		latestId: firstProduct.id,
	// 	};

	// 	featureCreatedRef.current = {
	// 		created: true,
	// 		latestId: firstFeature.id,
	// 	};

	// 	// Set feature with proper structure
	// 	setFeature({
	// 		...firstFeature,
	// 		config: firstFeature.config || {},
	// 	});

	// 	// Load product data
	// 	const productData = await loadProductData(firstProduct.id);
	// 	return !!productData;
	// }, [
	// 	products,
	// 	features,
	// 	productCreatedRef,
	// 	featureCreatedRef,
	// 	setFeature,
	// 	loadProductData,
	// ]);

	// Refetch product data
	const handleRefetch = () => {};

	// useEffect(() => {
	// 	console.log("[useOnboardingData] Feature: ", feature);
	// }, [feature]);

	const isQueryLoading = useMemo(() => {
		return productsLoading || featuresLoading;
	}, [productsLoading, featuresLoading]);

	return {
		// Core data
		product,
		setProduct,
		baseProduct,
		setBaseProduct,
		feature,
		setFeature,
		diff,

		// Product selection
		selectedProductId,
		setSelectedProductId,
		products,
		features,

		// Refs for resumability
		productCreatedRef,
		featureCreatedRef,

		// Loading state
		isQueryLoading,
		isButtonLoading,
		setIsButtonLoading,

		// Actions
		// loadProductData,
		handleRefetch,
		refetchProducts,
		refetchFeatures,
	};
};
