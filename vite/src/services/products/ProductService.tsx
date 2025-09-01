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
		version?: number,
	) {
		const url = notNullish(version)
			? `/v1/products/${productId}?version=${version}`
			: `/v1/products/${productId}`;
		await axiosInstance.post(url, data);
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

	static async getRequiredOptions(axiosInstance: AxiosInstance, data: any) {
		return await axiosInstance.post(`/products/product_options`, {
			...data,
		});
	}

	static async copyProduct(
		axiosInstance: AxiosInstance,
		productId: string,
		data: any,
	) {
		await axiosInstance.post(`/v1/products/${productId}/copy`, data);
	}
}
