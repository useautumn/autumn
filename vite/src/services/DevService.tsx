import { AxiosInstance } from "axios";

export class DevService {
  static async createAPIKey(axiosInstance: AxiosInstance, data: any) {
    const { data: resBody } = await axiosInstance.post("/dev/api_key", data);
    return resBody;
  }

  static async deleteAPIKey(axiosInstance: AxiosInstance, id: string) {
    const { data: resBody } = await axiosInstance.delete(`/dev/api_key/${id}`);
    return resBody;
  }

  static async createOTP(axiosInstance: AxiosInstance) {
    const { data: resBody } = await axiosInstance.post("/dev/otp");
    return resBody;
  }
}
