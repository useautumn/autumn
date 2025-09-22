import { AxiosInstance } from "axios";

export class FeatureService {
	static async createFeature(axiosInstance: AxiosInstance, data: any) {
		return await axiosInstance.post("/features", data);
	}

	static async updateFeature(
		axiosInstance: AxiosInstance,
		featureId: string,
		data: any,
	) {
		return await axiosInstance.post(`/features/${featureId}`, data);
	}

	static async deleteFeature(axiosInstance: AxiosInstance, featureId: string) {
		return await axiosInstance.delete(`/features/${featureId}`);
	}
}
