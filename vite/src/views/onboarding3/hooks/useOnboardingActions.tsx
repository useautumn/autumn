import {
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

export const useOnboardingActions = ({
	axiosInstance,
	productCreatedRef,
	featureCreatedRef,
}: {
	axiosInstance: AxiosInstance;
	productCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>;
	featureCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>;
}) => {
	const createProduct = async (product: any) => {
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

			let createdProduct: ReturnType<typeof ProductService.createProduct>;

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
				console.log("[Step 1→2] Created product response:", createdProduct);
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
				console.log("[Step 1→2] Updated product:", createdProduct);
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

	const createFeature = async (feature: any) => {
		const result = CreateFeatureSchema.safeParse(feature);
		if (result.error) {
			console.log(result.error.issues);
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
				console.log("[Step 2→3] Feature created:", newFeature);
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
				console.log("[Step 2→3] Feature updated:", newFeature);
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

	const createProductItem = (createdFeature: any) => {
		// Map feature type to product item feature type
		let featureType = null;
		if (createdFeature.type === "boolean") {
			featureType = "static";
		} else if (createdFeature.type === "credit_system") {
			featureType = "single_use";
		} else if (createdFeature.type === "metered") {
			// For metered features, use the usage_type from config
			featureType = createdFeature.config?.usage_type || "single_use";
		}

		return {
			feature_id: createdFeature.id,
			feature_type: featureType,
			included_usage: null,
			interval: ProductItemInterval.Month,
			price: null,
			tiers: null,
			billing_units: 1,
			entity_feature_id: null,
			reset_usage_when_enabled: true,
		};
	};

	return {
		createProduct,
		createFeature,
		createProductItem,
	};
};
