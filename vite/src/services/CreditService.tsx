import { AxiosInstance } from "axios";

export class CreditService {
  static async createSystem(axiosInstance: AxiosInstance, data: any) {
    return await axiosInstance.post("/credits/systems", data);
  }
}
