import { AxiosInstance } from "axios";

export class OrgService {
  static async get(axiosInstance: AxiosInstance) {
    return await axiosInstance.get(`/organization`);
  }

  static async create(axiosInstance: AxiosInstance, data: any) {
    return await axiosInstance.post(`/organization`, data);
  }

  static async connectStripe(axiosInstance: AxiosInstance, data: any) {
    return await axiosInstance.post(`/organization/stripe`, data);
  }

  static async disconnectStripe(axiosInstance: AxiosInstance) {
    return await axiosInstance.delete(`/organization/stripe`);
  }
}
