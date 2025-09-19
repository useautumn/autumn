import { RewardProgram, CreateRewardProgram } from "@autumn/shared";

import { AxiosInstance } from "axios";

export class RewardProgramService {
  static async createReward({
    axiosInstance,
    data,
  }: {
    axiosInstance: AxiosInstance;
    data: CreateRewardProgram;
  }) {
    await axiosInstance.post("/v1/reward_programs", data);
  }

  static async deleteReward({
    axiosInstance,
    internalId,
  }: {
    axiosInstance: AxiosInstance;
    internalId: string;
  }) {
    await axiosInstance.delete(`/v1/reward_programs/${internalId}`);
  }

  static async updateReward({
    axiosInstance,
    internalId,
    data,
  }: {
    axiosInstance: AxiosInstance;
    internalId: string;
    data: RewardProgram;
  }) {
    try {
      const res = await axiosInstance.put(
        `/v1/reward_programs/${internalId}`,
        data
      );
      return res.data;
    } catch (err: any) {
      // maybe rethrow as your RecaseError or wrap
      throw new Error(
        err.response?.data?.message || "Failed to update reward program"
      );
    }
  }
}
