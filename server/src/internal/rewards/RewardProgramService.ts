import RecaseError from "@/utils/errorUtils.js";
import { ErrCode, RewardProgram } from "@autumn/shared";
import { ReferralCode } from "@shared/models/rewardModels/referralModels/referralModels.js";

export class RewardProgramService {
  static async get({ sb, internalId }: { sb: any; internalId: string }) {
    const { data, error } = await sb
      .from("reward_programs")
      .select("*, reward:rewards!inner(*)")
      .eq("internal_id", internalId);

    if (error) {
      throw error;
    }

    return data[0];
  }

  static async getById({
    sb,
    id,
    orgId,
    env,
    errorIfNotFound = false,
  }: {
    sb: any;
    id: string;
    orgId: string;
    env: string;
    errorIfNotFound?: boolean;
  }) {
    const { data, error } = await sb
      .from("reward_programs")
      .select()
      .eq("id", id)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      if (errorIfNotFound) {
        throw new RecaseError({
          message: "Referral not found",
          code: ErrCode.ReferralNotFound,
        });
      }

      return null;
    }

    return data[0];
  }

  static async getAll({
    sb,
    orgId,
    env,
  }: {
    sb: any;
    orgId: string;
    env: string;
  }) {
    const { data, error } = await sb
      .from("reward_programs")
      .select()
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }

    return data;
  }

  static async create({
    sb,
    data,
  }: {
    sb: any;

    data: RewardProgram | RewardProgram[];
  }) {
    const { data: insertedData, error } = await sb
      .from("reward_programs")
      .insert(data)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return insertedData;
  }

  static async deleteById({
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
      .from("reward_programs")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
      .eq("env", env)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  // REFERRAL CODE FUNCTIONS
  static async getReferralCode({
    sb,
    orgId,
    env,
    code,
    withRewardProgram = false,
  }: {
    sb: any;
    orgId: string;
    env: string;
    code: string;
    withRewardProgram?: boolean;
  }) {
    const { data, error } = await sb
      .from("referral_codes")
      .select(
        withRewardProgram
          ? "*, reward_program:reward_programs!inner(*, reward:rewards!inner(*))"
          : "*"
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

  static async getCodeByCustomerAndRewardProgram({
    sb,
    orgId,
    env,
    internalCustomerId,
    internalRewardProgramId,
  }: {
    sb: any;
    orgId: string;
    env: string;
    internalCustomerId: string;
    internalRewardProgramId: string;
  }) {
    const { data, error } = await sb
      .from("referral_codes")
      .select("*")
      .eq("internal_customer_id", internalCustomerId)
      .eq("internal_reward_program_id", internalRewardProgramId)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      return null;
    }

    return data[0];
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
    referralCodeId,
  }: {
    sb: any;
    referralCodeId: string;
  }) {
    const { data, error, count } = await sb
      .from("reward_redemptions")
      .select("*, reward_program:reward_programs!inner(*)", { count: "exact" })
      .eq("referral_code_id", referralCodeId)
      .eq("triggered", true);

    if (error) {
      throw error;
    }

    return count;
  }
}
