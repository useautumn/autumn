import { AxiosInstance } from "axios";
import { Customer } from "@autumn/shared";

export class CusService {
  static async createCustomer(axios: AxiosInstance, data: any) {
    await axios.post("/v1/customers", data);
  }

  static async deleteCustomer(axios: AxiosInstance, customer_id: string) {
    await axios.delete(`/v1/customers/${customer_id}`);
  }

  static async addProduct(
    axios: AxiosInstance,
    customer_id: string,
    data: any
  ) {
    return await axios.post(`/v1/attach`, {
      customer_id,
      ...data,
    });
  }
}
