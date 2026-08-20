import type {
	PreviewUpdateCatalogResponse,
	UpdateCatalogParamsInput,
	UpdateCatalogResponse,
} from "@autumn/shared";
import type { AxiosInstance } from "axios";

export class CatalogV2Service {
	static async previewUpdate(
		axiosInstance: AxiosInstance,
		params: UpdateCatalogParamsInput,
	): Promise<PreviewUpdateCatalogResponse> {
		const response = await axiosInstance.post(
			"/v1/catalogV2.preview_update",
			params,
		);
		return response.data;
	}

	static async update(
		axiosInstance: AxiosInstance,
		params: UpdateCatalogParamsInput,
	): Promise<UpdateCatalogResponse> {
		const response = await axiosInstance.post("/v1/catalogV2.update", params);
		return response.data;
	}
}
