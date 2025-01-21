import { AxiosInstance } from "axios";

export class OrgService {
  static async get(axiosInstance: AxiosInstance) {
    return await axiosInstance.get(`/organization`);
  }

  static async connectStripe(axiosInstance: AxiosInstance, data: any) {
    return await axiosInstance.post(`/organization/stripe`, data);
  }

  static async syncStripe(axiosInstance: AxiosInstance) {
    return await axiosInstance.post(`/organization/sync`);
  }
}
