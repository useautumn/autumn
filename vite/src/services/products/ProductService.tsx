import type { UpdatePlanParamsV2Input } from "@autumn/shared";
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
}
