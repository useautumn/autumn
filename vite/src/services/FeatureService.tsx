import type {
	ApiFeatureV1,
	CreateFeatureV1Params,
	UpdateFeatureV1Params,
} from "@autumn/shared";
import type { AxiosInstance } from "axios";

const featureHeaders = {
	"x-api-version": "2.0.0",
};
export class FeatureService {
	static async createFeature(
		axiosInstance: AxiosInstance,
		data: CreateFeatureV1Params,
	) {
		return await axiosInstance.post<ApiFeatureV1>("/v1/features", data, {
			headers: featureHeaders,
		});
	}

	static async updateFeature(
		axiosInstance: AxiosInstance,
		featureId: string,
		data: UpdateFeatureV1Params,
	) {
		return await axiosInstance.post(`/v1/features/${featureId}`, data, {
			headers: featureHeaders,
		});
	}

	static async deleteFeature(axiosInstance: AxiosInstance, featureId: string) {
		return await axiosInstance.delete(`/v1/features/${featureId}`, {
			headers: featureHeaders,
		});
	}
}
