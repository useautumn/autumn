import {
	customers,
	ErrCode,
	type RewardRedemption,
	type RewardTriggerEvent,
	referralCodes,
	rewardPrograms,
	rewardRedemptions,
	rewards,
} from "@autumn/shared";
import { and, eq, inArray, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";

export class RewardRedemptionService {
	static async getById({ db, id }: { db: DrizzleCli; id: string }) {
		const data = await db.query.rewardRedemptions.findFirst({
			where: eq(rewardRedemptions.id, id),
		});

		if (!data) {
			throw new RecaseError({
				code: ErrCode.RewardRedemptionNotFound,
				message: `Reward redemption ${id} not found`,
				statusCode: 404,
			});
		}

		return data;
	}

	static async getByCustomer({
		db,
		internalCustomerId,
		triggered,
		withReferralCode = false,
		withRewardProgram = false,
		internalRewardProgramId,
		triggerWhen,
		limit,
	}: {
		db: DrizzleCli;
		internalCustomerId: string;
		triggered?: boolean;
		withReferralCode?: boolean;
		withRewardProgram?: boolean;
		internalRewardProgramId?: string;
		triggerWhen?: RewardTriggerEvent;
		limit?: number;
	}) {
		const data = await db.query.rewardRedemptions.findMany({
			where: and(
				eq(rewardRedemptions.internal_customer_id, internalCustomerId),
				internalRewardProgramId
					? eq(
							rewardRedemptions.internal_reward_program_id,
							internalRewardProgramId,
						)
					: undefined,
				triggered ? eq(rewardRedemptions.triggered, triggered) : undefined,
			),
			with: {
				reward_program: {
					with: {
						reward: true,
					},
				},
				referral_code: true,
			},
			limit: limit ?? 100,
		});

		return data as any;
	}

	static async getByReferrer({
		db,
		internalCustomerId,
		withCustomer = false,
		limit = 100,
		withRewardProgram = false,
	}: {
		db: DrizzleCli;
		internalCustomerId: string;
		withCustomer?: boolean;
		limit?: number;
		withRewardProgram?: boolean;
	}) {
		let query = db
			.select()
			.from(rewardRedemptions)
			.innerJoin(
				referralCodes,
				eq(rewardRedemptions.referral_code_id, referralCodes.id),
			)
			.innerJoin(
				customers,
				eq(rewardRedemptions.internal_customer_id, customers.internal_id),
			);

		if (withRewardProgram) {
			query = query.innerJoin(
				rewardPrograms,
				eq(
					rewardRedemptions.internal_reward_program_id,
					rewardPrograms.internal_id,
				),
			);
		}
		const data = await query
			.where(eq(referralCodes.internal_customer_id, internalCustomerId))
			.limit(limit);

		const processed = data.map((d) => ({
			...d.reward_redemptions,
			referral_code: d.referral_codes,
			customer: d.customers,
			reward_program: withRewardProgram
				? (d as any).reward_programs
				: undefined,
		}));

		return processed;
	}

	static async insert({
		db,
		rewardRedemption,
	}: {
		db: DrizzleCli;
		rewardRedemption: RewardRedemption;
	}) {
		const data = await db
			.insert(rewardRedemptions)
			.values(rewardRedemption)
			.returning();

		if (data.length === 0) {
			throw new RecaseError({
				code: ErrCode.InsertRewardRedemptionFailed,
				message: `Failed to insert reward redemption`,
				statusCode: 500,
			});
		}

		return data[0] as RewardRedemption;
	}

	static async update({
		db,
		id,
		updates,
	}: {
		db: DrizzleCli;
		id: string;
		updates: any;
	}) {
		const data = await db
			.update(rewardRedemptions)
			.set(updates)
			.where(eq(rewardRedemptions.id, id))
			.returning();

		if (data.length === 0) {
			throw new RecaseError({
				code: "REWARD_REDEMPTION_NOT_FOUND",
				message: `Reward redemption ${id} not found`,
			});
		}

		return data[0] as RewardRedemption;
	}

	static async getUnappliedRedemptions({
		db,
		internalCustomerId,
	}: {
		db: DrizzleCli;
		internalCustomerId: string;
	}) {
		const data = await db
			.select()
			.from(rewardRedemptions)
			.innerJoin(
				referralCodes,
				eq(rewardRedemptions.referral_code_id, referralCodes.id),
			)
			.innerJoin(
				customers,
				eq(rewardRedemptions.internal_customer_id, customers.internal_id),
			)
			.innerJoin(
				rewardPrograms,
				eq(
					rewardRedemptions.internal_reward_program_id,
					rewardPrograms.internal_id,
				),
			)
			.innerJoin(
				rewards,
				eq(rewardPrograms.internal_reward_id, rewards.internal_id),
			)
			.where(
				or(
					and(
						eq(referralCodes.internal_customer_id, internalCustomerId),
						eq(rewardRedemptions.triggered, true),
						eq(rewardRedemptions.applied, false),
					),
					and(
						eq(rewardRedemptions.internal_customer_id, internalCustomerId),
						eq(rewardRedemptions.triggered, true),
						eq(rewardRedemptions.redeemer_applied, false),
					),
				),
			);

		if (data.length === 0) return [];

		const processed = data.map((d) => ({
			...d.reward_redemptions,
			referral_code: d.referral_codes,
			reward_program: {
				...d.reward_programs,
				reward: d.rewards,
			},
		}));

		return processed;
	}

	static async _resetCustomerRedemptions({
		db,
		internalCustomerId,
	}: {
		db: DrizzleCli;
		internalCustomerId: string | string[];
	}) {
		if (!Array.isArray(internalCustomerId))
			internalCustomerId = [internalCustomerId];
		return await db
			.delete(rewardRedemptions)
			.where(
				inArray(rewardRedemptions.internal_customer_id, internalCustomerId),
			);
	}
}
