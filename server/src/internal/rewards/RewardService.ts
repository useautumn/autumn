import {
	type AppEnv,
	ErrCode,
	notNullish,
	type Reward,
	type RewardType,
	rewards,
} from "@autumn/shared";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";

export class RewardService {
	static async get({
		db,
		idOrInternalId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		idOrInternalId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const result = await db.query.rewards.findFirst({
			where: and(
				or(
					eq(rewards.id, idOrInternalId),
					eq(rewards.internal_id, idOrInternalId),
				),
				eq(rewards.org_id, orgId),
				eq(rewards.env, env),
			),
		});

		if (!result) {
			return null;
		}

		return result as Reward;
	}

	static async getInIds({
		db,
		ids,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		ids: string[];
		orgId: string;
		env: AppEnv;
	}) {
		return (await db.query.rewards.findMany({
			where: and(
				inArray(rewards.id, ids),
				eq(rewards.org_id, orgId),
				eq(rewards.env, env),
			),
		})) as Reward[];
	}

	static async getByIdOrCode({
		db,
		codes,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		codes: string[];
		orgId: string;
		env: AppEnv;
	}) {
		const rewardResults = await db.query.rewards.findMany({
			where: and(
				eq(rewards.org_id, orgId),
				eq(rewards.env, env),
				or(
					inArray(rewards.id, codes),
					...codes.map(
						(code) => sql`EXISTS (
            SELECT 1 FROM unnest("promo_codes") AS elem
            WHERE elem->>'code' = ${code}
          )`,
					),
				),
			),
		});

		const codesSet = new Set(codes);
		return rewardResults.map((reward) => {
			const matchedById = notNullish(reward.id)
				? codesSet.has(reward.id)
				: false;
			return {
				...reward,
				show_as_promo_code_in_checkout: matchedById,
			} as Reward;
		});
	}

	static async insert({
		db,
		data,
	}: {
		db: DrizzleCli;
		data: Reward | Reward[];
	}) {
		const results = await db.insert(rewards).values(data as Reward);
		return results as Reward[];
	}

	static async list({
		db,
		orgId,
		env,
		inTypes,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		inTypes?: RewardType[];
	}) {
		const results = await db.query.rewards.findMany({
			where: and(
				eq(rewards.org_id, orgId),
				eq(rewards.env, env),
				inTypes ? inArray(rewards.type, inTypes) : undefined,
			),
			orderBy: [desc(rewards.internal_id)],
		});

		return results as Reward[];
	}

	static async delete({
		db,
		internalId,
		env,
		orgId,
	}: {
		db: DrizzleCli;
		internalId: string;
		env: AppEnv;
		orgId: string;
	}) {
		await db
			.delete(rewards)
			.where(
				and(
					eq(rewards.internal_id, internalId),
					eq(rewards.env, env),
					eq(rewards.org_id, orgId),
				),
			);
	}

	static async update({
		db,
		internalId,
		env,
		orgId,
		update,
	}: {
		db: DrizzleCli;
		internalId: string;
		env: AppEnv;
		orgId: string;
		update: Partial<Reward>;
	}) {
		const result = await db
			.update(rewards)
			.set(update)
			.where(
				and(
					eq(rewards.internal_id, internalId),
					eq(rewards.env, env),
					eq(rewards.org_id, orgId),
				),
			)
			.returning();

		if (result.length === 0) {
			throw new RecaseError({
				message: `Reward ${internalId} not found`,
				code: ErrCode.InvalidRequest,
			});
		}

		return result[0] as Reward;
	}

	static async deleteByOrgId({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}) {
		await db
			.delete(rewards)
			.where(and(eq(rewards.org_id, orgId), eq(rewards.env, env)));
	}
}
