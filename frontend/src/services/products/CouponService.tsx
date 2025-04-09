import { CreateReward } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";
import { AxiosInstance } from "axios";

export class CouponService {
  static async createCoupon({
    axiosInstance,
    data,
  }: {
    axiosInstance: AxiosInstance;
    data: CreateReward;
  }) {
    await axiosInstance.post("/v1/coupons", data);
  }

  static async deleteCoupon({
    axiosInstance,
    internalId,
  }: {
    axiosInstance: AxiosInstance;
    internalId: string;
  }) {
    await axiosInstance.delete(`/v1/coupons/${internalId}`);
  }
}
