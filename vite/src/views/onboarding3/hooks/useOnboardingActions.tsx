import {
	CreateFeatureSchema,
	CreateProductSchema,
	ProductItemInterval,
} from "@autumn/shared";
import type { AxiosError, AxiosInstance } from "axios";
import { toast } from "sonner";
import { FeatureService } from "@/services/FeatureService";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";

export const useOnboardingActions = (axiosInstance: AxiosInstance) => {
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

			const createdProduct = await ProductService.createProduct(
				axiosInstance,
				result.data,
			);

			console.log("[Step 1→2] Created product response:", createdProduct);
			toast.success(`Product "${product?.name}" created successfully!`);

			return {
				...product,
				...createdProduct,
				items: product?.items || [],
			};
		} catch (error: unknown) {
			console.error("Failed to create product:", error);
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create product"),
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
			const { data: newFeature } = await FeatureService.createFeature(
				axiosInstance,
				{
					name: feature.name,
					id: feature.id,
					type: feature.type,
					config: feature.config,
				},
			);

			if (!newFeature.id) return null;

			console.log("[Step 2→3] Feature created:", newFeature);
			return newFeature;
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create feature"),
			);
			return null;
		}
	};

	const createProductItem = (createdFeature: any) => {
		return {
			feature_id: createdFeature.id,
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
