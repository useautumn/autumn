import { and, arrayContains, count, eq, inArray, or } from "drizzle-orm";
import RecaseError from "@/utils/errorUtils.js";
import {
	ErrCode,
	Reward,
	RewardProgram,
	rewardPrograms,
	RewardTriggerEvent,
} from "@autumn/shared";
import { ReferralCode } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { referralCodes, rewardRedemptions } from "@autumn/shared";

export class RewardProgramService {
	static async get({
		db,
		idOrInternalId,
		orgId,
		env,
		errorIfNotFound = false,
	}: {
		db: DrizzleCli;
		idOrInternalId: string;
		orgId: string;
		env: string;
		errorIfNotFound?: boolean;
	}) {
		let result = await db.query.rewardPrograms.findFirst({
			where: and(
				or(
					eq(rewardPrograms.id, idOrInternalId),
					eq(rewardPrograms.internal_id, idOrInternalId),
				),
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
		let result = await db.query.rewardPrograms.findMany({
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
		let result = await db.query.rewardPrograms.findMany({
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
		let result = await db.query.referralCodes.findFirst({
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
		let result = await db
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
		idOrInternalId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		idOrInternalId: string;
		orgId: string;
		env: string;
	}) {
		let result = await db
			.delete(rewardPrograms)
			.where(
				and(
					or(
						eq(rewardPrograms.id, idOrInternalId),
						eq(rewardPrograms.internal_id, idOrInternalId),
					),
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
		let result = await db.query.referralCodes.findFirst({
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
		let result = await db.insert(referralCodes).values(data).returning();

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
		let result = await db
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

	static async update({
		db,
		idOrInternalId,
		orgId,
		env,
		data,
	}: {
		db: DrizzleCli;
		idOrInternalId: string;
		orgId: string;
		env: string;
		data: RewardProgram;
	}) {
		let result = await db
			.update(rewardPrograms)
			.set(data as any)
			.where(
				and(
					or(
						eq(rewardPrograms.id, idOrInternalId),
						eq(rewardPrograms.internal_id, idOrInternalId),
					),
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
}
