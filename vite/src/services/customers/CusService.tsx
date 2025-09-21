import axios, { AxiosInstance } from "axios";
import { Customer } from "@autumn/shared";

export class CusService {
  static async createCustomer(axios: AxiosInstance, data: any) {
    return await axios.post("/v1/customers?with_autumn_id=true", data);
  }

  static async deleteCustomer(axios: AxiosInstance, customer_id: any) {
    await axios.delete(`/v1/customers/${customer_id}`);
  }

  static async attach(axios: AxiosInstance, data: any) {
    return await axios.post(`/v1/attach`, {
      ...data,
    });
  }

  static async updateCustomer({
    axios,
    customer_id,
    data,
  }: {
    axios: AxiosInstance;
    customer_id: string;
    data: any;
  }) {
    return await axios.post(`/v1/customers/${customer_id}`, data);
  }

  static async getProductOptions(axios: AxiosInstance, data: any) {
    return await axios.post(`/customers/product_options`, {
      ...data,
    });
  }

  static async updateCusEntitlement(
    axios: AxiosInstance,
    customer_id: string,
    customer_entitlement_id: string,
    data: any
  ) {
    return await axios.post(
      `/v1/customers/${customer_id}/entitlements/${customer_entitlement_id}`,
      data
    );
  }

  static async updateCusProductStatus(
    axios: AxiosInstance,
    customer_product_id: string,
    data: any
  ) {
    return await axios.post(
      `/v1/customers/customer_products/${customer_product_id}`,
      data
    );
  }

  static async addCouponToCustomer({
    axios,
    customer_id,
    coupon_id,
  }: {
    axios: AxiosInstance;
    customer_id: string;
    coupon_id: string;
  }) {
    return await axios.post(
      `/v1/customers/${customer_id}/coupons/${coupon_id}`
    );
  }

  static async getCustomerCoupon({
    axiosInstance,
    customer_id,
  }: {
    axiosInstance: AxiosInstance;
    customer_id: string;
  }) {
    const res = await axiosInstance.get(`/v1/customers/${customer_id}/coupon`);
    return res.data;
  }
}
