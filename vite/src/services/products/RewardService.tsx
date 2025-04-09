import { Reward, CreateReward } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";
import { AxiosInstance } from "axios";

export class RewardService {
  static async createReward({
    axiosInstance,
    data,
  }: {
    axiosInstance: AxiosInstance;
    data: CreateReward;
  }) {
    await axiosInstance.post("/v1/rewards", data);
  }

  static async deleteReward({
    axiosInstance,
    internalId,
  }: {
    axiosInstance: AxiosInstance;
    internalId: string;
  }) {
    await axiosInstance.delete(`/v1/rewards/${internalId}`);
  }

  static async updateReward({
    axiosInstance,
    internalId,
    data,
  }: {
    axiosInstance: AxiosInstance;
    internalId: string;
    data: Reward;
  }) {
    await axiosInstance.post(`/v1/rewards/${internalId}`, data);
  }
}
