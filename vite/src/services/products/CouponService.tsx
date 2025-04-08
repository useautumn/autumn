import { Coupon, CreateCoupon } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";
import { AxiosInstance } from "axios";

export class CouponService {
  static async createCoupon({
    axiosInstance,
    data,
  }: {
    axiosInstance: AxiosInstance;
    data: CreateCoupon;
  }) {
    await axiosInstance.post("/v1/rewards", data);
  }

  static async deleteCoupon({
    axiosInstance,
    internalId,
  }: {
    axiosInstance: AxiosInstance;
    internalId: string;
  }) {
    await axiosInstance.delete(`/v1/rewards/${internalId}`);
  }

  static async updateCoupon({
    axiosInstance,
    internalId,
    data,
  }: {
    axiosInstance: AxiosInstance;
    internalId: string;
    data: Coupon;
  }) {
    await axiosInstance.post(`/v1/rewards/${internalId}`, data);
  }
}
