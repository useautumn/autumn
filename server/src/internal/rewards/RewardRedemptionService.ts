import { notNullish } from "@/utils/genUtils.js";
import { RewardRedemption, RewardTriggerEvent } from "@autumn/shared";

export class RewardRedemptionService {
  static async getById({ sb, id }: { sb: any; id: string }) {
    const { data, error } = await sb
      .from("reward_redemptions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async getByCustomer({
    sb,
    internalCustomerId,
    triggered,
    withReferralCode = false,
    withRewardProgram = false,
    internalRewardProgramId,
    triggerWhen,
  }: {
    sb: any;
    internalCustomerId: string;
    triggered?: boolean;
    withReferralCode?: boolean;
    withRewardProgram?: boolean;
    internalRewardProgramId?: string;
    triggerWhen?: RewardTriggerEvent;
  }) {
    let query = sb
      .from("reward_redemptions")
      .select(
        `
      *
      ${
        withRewardProgram
          ? ", reward_program:reward_programs!inner(*, reward:rewards!inner(*))"
          : ""
      }
      ${withReferralCode ? ", referral_code:referral_codes!inner(*)" : ""}
      `
      )
      .eq("internal_customer_id", internalCustomerId);

    if (notNullish(internalRewardProgramId)) {
      query = query.eq("internal_reward_program_id", internalRewardProgramId);
    }

    if (notNullish(triggered)) {
      query = query.eq("triggered", triggered);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data;
  }

  static async getByCodeAndCustomer({
    sb,
    orgId,
    env,
    code,
    internalCustomerId,
  }: {
    sb: any;
    orgId: string;
    env: string;
    code: string;
    internalCustomerId: string;
  }) {
    const { data, error } = await sb
      .from("reward_redemptions")
      .select("*")
      .eq("code", code)
      .eq("internal_customer_id", internalCustomerId);

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      return null;
    }

    return data[0];
  }

  static async insert({
    sb,
    rewardRedemption,
  }: {
    sb: any;
    rewardRedemption: RewardRedemption;
  }) {
    const { data, error } = await sb
      .from("reward_redemptions")
      .insert(rewardRedemption)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async update({
    sb,
    id,
    updates,
  }: {
    sb: any;
    id: string;
    updates: any;
  }) {
    const { data, error } = await sb
      .from("reward_redemptions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async getUnappliedRedemptions({
    sb,
    internalCustomerId,
  }: {
    sb: any;
    internalCustomerId: string;
  }) {
    const { data, error } = await sb
      .from("reward_redemptions")
      .select(
        "*, referral_code:referral_codes!inner(*), reward_program:reward_programs!inner(*, reward:rewards!inner(*))"
      )
      .eq("referral_code.internal_customer_id", internalCustomerId)
      .eq("triggered", true)
      .eq("applied", false);

    if (error) {
      throw error;
    }

    return data;
  }
}
