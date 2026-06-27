import type {
	CreateVariantParamsV2Input,
	DiffedCustomizePlanV1,
	PlanUpdatePreviewItemChange,
	PlanUpdatePreviewPriceChange,
	ProductItem,
	ProductV2,
	UpdatePlanParamsV2Input,
} from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { notNullish } from "@/utils/genUtils";

export class ProductService {
	static async createProduct(axiosInstance: AxiosInstance, data: any) {
		const response = await axiosInstance.post("/v1/products", data);
		return response.data;
	}

	static async updateProduct(
		axiosInstance: AxiosInstance,
		productId: string,
		data: any,
		options?: { version?: number },
	) {
		const params = new URLSearchParams();
		if (notNullish(options?.version))
			params.set("version", String(options.version));
		const qs = params.toString();
		const url = qs
			? `/v1/products/${productId}?${qs}`
			: `/v1/products/${productId}`;
		const response = await axiosInstance.post(url, data);
		return response.data;
	}

	static async updatePlan(
		axiosInstance: AxiosInstance,
		data: UpdatePlanParamsV2Input,
	) {
		const response = await axiosInstance.post("/v1/plans.update", data);
		return response.data;
	}

	static async deleteProduct(
		axiosInstance: AxiosInstance,
		productId: string,
		allVersions?: boolean,
	) {
		await axiosInstance.delete(
			`/v1/products/${productId}?all_versions=${allVersions}`,
		);
	}

	static async createEntitlement(axiosInstance: AxiosInstance, data: any) {
		await axiosInstance.post(`/v1/entitlements`, data);
	}

	static async createPrice(
		axiosInstance: AxiosInstance,
		productId: string,
		data: any,
	) {
		await axiosInstance.post(`/products/${productId}/prices`, data);
	}

	static async copyProduct(
		axiosInstance: AxiosInstance,
		productId: string,
		data: any,
	) {
		const response = await axiosInstance.post(
			`/v1/products/${productId}/copy`,
			data,
		);
		return response.data;
	}

	static async createVariant(
		axiosInstance: AxiosInstance,
		data: CreateVariantParamsV2Input,
	) {
		const response = await axiosInstance.post(
			"/v1/plans.create_variant",
			data,
		);
		return response.data;
	}

	static async previewUpdate(
		axiosInstance: AxiosInstance,
		data: UpdatePlanParamsV2Input,
	) {
		const response = await axiosInstance.post(
			"/v1/plans.preview_update",
			data,
		);
		return response.data;
	}

	static async listVariants(axiosInstance: AxiosInstance, planId: string) {
		const response = await axiosInstance.get(`/products/${planId}/variants`);
		return response.data as { variants: PlanVariant[] };
	}
}

export interface PlanVariant {
	id: string;
	name: string;
	latest_version: number;
	items: ProductItem[];
	product?: ProductV2;
	customize?: DiffedCustomizePlanV1 | null;
	price_change?: PlanUpdatePreviewPriceChange;
	item_changes?: PlanUpdatePreviewItemChange[];
}
