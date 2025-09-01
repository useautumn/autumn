import type { ReferralCode } from "@autumn/shared";
import {
	ErrCode,
	type Reward,
	type RewardProgram,
	RewardTriggerEvent,
	referralCodes,
	rewardPrograms,
	rewardRedemptions,
} from "@autumn/shared";
import { and, arrayContains, count, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";

export class RewardProgramService {
	static async get({
		db,
		id,
		orgId,
		env,
		errorIfNotFound = false,
	}: {
		db: DrizzleCli;
		id: string;
		orgId: string;
		env: string;
		errorIfNotFound?: boolean;
	}) {
		const result = await db.query.rewardPrograms.findFirst({
			where: and(
				eq(rewardPrograms.id, id),
				eq(rewardPrograms.org_id, orgId),
				eq(rewardPrograms.env, env),
			),
		});

		if (!result) {
			if (errorIfNotFound) {
				throw new RecaseError({
					message: "Reward program not found",
					code: ErrCode.RewardNotFound,
				});
			}

			return null;
		}

		return result as RewardProgram;
	}

	static async list({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: string;
	}) {
		const result = await db.query.rewardPrograms.findMany({
			where: and(eq(rewardPrograms.org_id, orgId), eq(rewardPrograms.env, env)),
		});

		return result as RewardProgram[];
	}

	static async getByProductId({
		db,
		productIds,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		productIds: string[];
		orgId: string;
		env: string;
	}) {
		const result = await db.query.rewardPrograms.findMany({
			where: and(
				eq(rewardPrograms.org_id, orgId),
				eq(rewardPrograms.env, env),
				eq(rewardPrograms.when, RewardTriggerEvent.Checkout),
				arrayContains(rewardPrograms.product_ids, productIds),
			),
		});

		return result as RewardProgram[];
	}

	static async getCodeByCustomerAndRewardProgram({
		db,
		orgId,
		env,
		internalCustomerId,
		internalRewardProgramId,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: string;
		internalCustomerId: string;
		internalRewardProgramId: string;
	}) {
		const result = await db.query.referralCodes.findFirst({
			where: and(
				eq(referralCodes.internal_customer_id, internalCustomerId),
				eq(referralCodes.internal_reward_program_id, internalRewardProgramId),
				eq(referralCodes.org_id, orgId),
				eq(referralCodes.env, env),
			),
		});

		if (!result) {
			return null;
		}

		return result as ReferralCode;
	}

	static async create({
		db,
		data,
	}: {
		db: DrizzleCli;
		data: RewardProgram | RewardProgram[];
	}) {
		const result = await db
			.insert(rewardPrograms)
			.values(data as any)
			.returning();

		if (result.length === 0) {
			throw new RecaseError({
				message: "Failed to create reward program",
				code: ErrCode.InsertRewardProgramFailed,
			});
		}

		return result[0] as RewardProgram;
	}

	static async delete({
		db,
		id,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		id: string;
		orgId: string;
		env: string;
	}) {
		const result = await db
			.delete(rewardPrograms)
			.where(
				and(
					eq(rewardPrograms.id, id),
					eq(rewardPrograms.org_id, orgId),
					eq(rewardPrograms.env, env),
				),
			)
			.returning();

		if (result.length === 0) {
			throw new RecaseError({
				message: "Reward program not found",
				code: ErrCode.RewardNotFound,
			});
		}

		return result[0] as RewardProgram;
	}

	// REFERRAL CODE FUNCTIONS
	static async getReferralCode({
		db,
		orgId,
		env,
		code,
		withRewardProgram = false,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: string;
		code: string;
		withRewardProgram?: boolean;
	}) {
		const result = await db.query.referralCodes.findFirst({
			where: and(
				eq(referralCodes.code, code),
				eq(referralCodes.org_id, orgId),
				eq(referralCodes.env, env),
			),
			with: withRewardProgram
				? {
						reward_program: {
							with: {
								reward: true,
							},
						},
					}
				: undefined,
		});

		if (!result) {
			throw new RecaseError({
				message: "Referral code not found",
				code: ErrCode.ReferralCodeNotFound,
				statusCode: 404,
			});
		}

		return result as ReferralCode & {
			reward_program: RewardProgram & {
				reward: Reward;
			};
		};
	}

	static async createReferralCode({
		db,
		data,
	}: {
		db: DrizzleCli;
		data: ReferralCode;
	}) {
		const result = await db.insert(referralCodes).values(data).returning();

		if (result.length === 0) {
			throw new RecaseError({
				message: "Failed to create referral code",
				code: ErrCode.InsertReferralCodeFailed,
			});
		}

		return result[0] as ReferralCode;
	}

	static async getCodeRedemptionCount({
		db,
		referralCodeId,
	}: {
		db: DrizzleCli;
		referralCodeId: string;
	}) {
		const result = await db
			.select({ count: count() })
			.from(rewardRedemptions)
			.where(
				and(
					eq(rewardRedemptions.referral_code_id, referralCodeId),
					eq(rewardRedemptions.triggered, true),
				),
			);

		return result[0].count;
	}
}
