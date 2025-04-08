import { RewardTrigger } from "@autumn/shared";
import { ReferralCode } from "@shared/models/rewardModels/referralModels/referralModels.js";

export class RewardTriggerService {
  static async getById({
    sb,
    id,
    orgId,
    env,
  }: {
    sb: any;
    id: string;
    orgId: string;
    env: string;
  }) {
    const { data, error } = await sb
      .from("reward_triggers")
      .select()
      .eq("id", id)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async createRewardTrigger({
    sb,
    data,
  }: {
    sb: any;

    data: RewardTrigger | RewardTrigger[];
  }) {
    const { data: insertedData, error } = await sb
      .from("reward_triggers")
      .insert(data)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return insertedData;
  }

  static async getReferralCode({
    sb,
    orgId,
    env,
    code,
    withRewardTrigger = false,
  }: {
    sb: any;
    orgId: string;
    env: string;
    code: string;
    withRewardTrigger?: boolean;
  }) {
    const { data, error } = await sb
      .from("referral_codes")
      .select(
        withRewardTrigger ? "*, reward_trigger:reward_triggers!inner(*)" : "*"
      )
      .eq("code", code)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async createReferralCode({
    sb,
    data,
  }: {
    sb: any;
    data: ReferralCode;
  }) {
    const { data: insertedData, error } = await sb
      .from("referral_codes")
      .insert(data)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return insertedData;
  }

  static async getCodeRedemptionCount({
    sb,
    orgId,
    env,
    code,
  }: {
    sb: any;
    orgId: string;
    env: string;
    code: string;
  }) {
    const { data, error, count } = await sb
      .from("reward_redemptions")
      .select("*, reward_trigger:reward_triggers!inner(*)", { count: "exact" })
      .eq("code", code)
      .eq("reward_trigger.org_id", orgId)
      .eq("reward_trigger.env", env);

    if (error) {
      throw error;
    }

    return count;
  }
}
