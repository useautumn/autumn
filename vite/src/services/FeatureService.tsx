import { AxiosInstance } from "axios";

export class FeatureService {
  static async createFeature(axiosInstance: AxiosInstance, data: any) {
    return await axiosInstance.post("/v1/features", data);
  }

  static async updateFeature(
    axiosInstance: AxiosInstance,
    featureId: string,
    data: any
  ) {
    return await axiosInstance.post(`/v1/features/${featureId}`, data);
  }

  static async deleteFeature(axiosInstance: AxiosInstance, featureId: string) {
    return await axiosInstance.delete(`/v1/features/${featureId}`);
  }
}
