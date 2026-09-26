/**
 * catalogV2 rewards — a pulled config pushed to another environment carries
 * that environment's reward internal_ids, which the target has never seen.
 *
 * Contract:
 *   R1  preview and update accept an unknown internal_id on a new reward and
 *       program, and create them
 *   R2  an unknown internal_id on a reward and program that already exist by id
 *       updates them in place rather than failing or duplicating
 *   R3  a known internal_id stated under a different id is still a refused rename
 *   R4  an internal_id held by a reward or program the catalog hides is refused,
 *       not mistaken for a foreign one
 *
 * Red (current):  any unknown internal_id is rejected with a 404.
 * Green (after):  an unknown internal_id falls back to matching by id, as plans do.
 */

import { expect, test } from "bun:test";
import {
	type ApiRewardsListV0,
	ApiRewardsListV0Schema,
	CouponDurationType,
	EntitlementDuration,
	ErrCode,
	RewardReceivedBy,
	RewardTriggerEvent,
	RewardType,
	type UpdateCatalogParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	rewardProgramRepo,
	rewardRepo,
} from "@/internal/rewards/repos/index.js";
import {
	constructReward,
	constructRewardProgram,
} from "@/internal/rewards/rewardUtils.js";

const ids = {
	coupon: "launch",
	grant: "referral_credits",
	program: "friends",
};

const foreignConfig = ({
	value,
	included,
	maxRedemptions,
	foreignSuffix,
}: {
	value: number;
	included: number;
	maxRedemptions: number;
	foreignSuffix: string;
}): UpdateCatalogParamsInput => ({
	rewards: [
		{
			coupon: {
				id: ids.coupon,
				internal_id: `rew_sandbox_coupon_${foreignSuffix}`,
				name: "Launch discount",
				type: RewardType.PercentageDiscount,
				value,
				duration: { type: CouponDurationType.Months, length: 3 },
				plan_ids: null,
				promo_codes: [],
			},
		},
		{
			feature_grant: {
				id: ids.grant,
				internal_id: `rew_sandbox_grant_${foreignSuffix}`,
				name: "Referral credits",
				grants: [
					{
						feature_id: TestFeature.Credits,
						included,
						expiry: { type: EntitlementDuration.Month, length: 1 },
					},
				],
				promo_codes: [{ code: "FRIENDS", max_uses: null }],
			},
		},
	],
	referral_programs: [
		{
			id: ids.program,
			internal_id: `rp_sandbox_${foreignSuffix}`,
			reward_id: ids.grant,
			redeem_on: RewardTriggerEvent.CustomerCreation,
			received_by: RewardReceivedBy.All,
			max_redemptions: maxRedemptions,
		},
	],
});

const listRewards = async ({
	autumn,
}: {
	autumn: AutumnInt;
}): Promise<ApiRewardsListV0> =>
	ApiRewardsListV0Schema.parse(await autumn.post("/rewards.list", {}));

const listPrograms = async ({
	autumn,
}: {
	autumn: AutumnInt;
}): Promise<{ id: string; max_redemptions: number | null }[]> =>
	(
		(await autumn.post("/referral_programs.list", {})) as {
			list: { id: string; max_redemptions: number | null }[];
		}
	).list;

const coupon = ({ id, internalId }: { id: string; internalId?: string }) => ({
	coupon: {
		id,
		internal_id: internalId,
		name: id,
		type: RewardType.PercentageDiscount,
		value: 10,
		duration: { type: CouponDurationType.Months, length: 1 },
		plan_ids: null,
		promo_codes: [],
	},
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 rewards: a foreign internal_id creates, then updates by id")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({
			customerId: "cv2-reward-foreign-iid",
			setup: [s.platform.create({ setupDefaultFeatures: true })],
			actions: [],
		});

		// R1: every stated internal_id is foreign, and nothing exists yet.
		const createConfig = foreignConfig({
			value: 20,
			included: 300,
			maxRedemptions: 5,
			foreignSuffix: "a",
		});
		const createPreview =
			await autumnV2_3.catalogV2.previewUpdate(createConfig);
		expect(
			createPreview.rewards.map(({ id, action }) => ({ id, action })),
		).toEqual([
			{ id: ids.coupon, action: "create" },
			{ id: ids.grant, action: "create" },
		]);
		expect(
			createPreview.referral_programs.map(({ id, action }) => ({ id, action })),
		).toEqual([{ id: ids.program, action: "create" }]);

		const created = await autumnV2_3.catalogV2.update(createConfig);
		const createdInternalIds = new Map(
			[...created.results.rewards, ...created.results.referral_programs].map(
				(row) => [row.id, row.internal_id],
			),
		);
		for (const id of Object.values(ids)) {
			expect(createdInternalIds.get(id), `${id} got its own id`).toBeString();
			expect(createdInternalIds.get(id)).not.toContain("sandbox");
		}

		// R2: the same ids pushed again under different foreign internal_ids.
		const updateConfig = foreignConfig({
			value: 25,
			included: 999,
			maxRedemptions: 7,
			foreignSuffix: "b",
		});
		const updatePreview =
			await autumnV2_3.catalogV2.previewUpdate(updateConfig);
		expect(
			[...updatePreview.rewards, ...updatePreview.referral_programs].map(
				({ id, internal_id, action }) => ({ id, internal_id, action }),
			),
		).toEqual(
			[ids.coupon, ids.grant, ids.program].map((id) => ({
				id,
				internal_id: createdInternalIds.get(id) ?? null,
				action: "update",
			})),
		);

		await autumnV2_3.catalogV2.update(updateConfig);
		const rewards = await listRewards({ autumn: autumnV2_3 });
		expect(rewards.coupons.filter(({ id }) => id === ids.coupon)).toHaveLength(
			1,
		);
		expect(rewards.coupons.find(({ id }) => id === ids.coupon)?.value).toBe(25);
		expect(
			rewards.feature_grants.find(({ id }) => id === ids.grant)?.grants[0]
				?.included,
		).toBe(999);
		const programs = (await listPrograms({ autumn: autumnV2_3 })).filter(
			({ id }) => id === ids.program,
		);
		expect(programs.map(({ max_redemptions }) => max_redemptions)).toEqual([7]);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rewards: internal_ids this env holds are never treated as foreign")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "cv2-reward-known-iid",
			setup: [s.platform.create({ setupDefaultFeatures: true })],
			actions: [],
		});

		const created = await autumnV2_3.catalogV2.update({
			rewards: [coupon({ id: "summer" })],
		});
		const summerInternalId = created.results.rewards[0]?.internal_id;
		expect(summerInternalId).toBeString();

		// R3
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "cannot be renamed",
			func: () =>
				autumnV2_3.catalogV2.previewUpdate({
					rewards: [
						coupon({ id: "winter", internalId: summerInternalId ?? undefined }),
					],
				}),
		});

		// R4: a free-product reward and its program, both hidden from the catalog.
		const [legacyReward] = await rewardRepo.insert({
			db: ctx.db,
			data: constructReward({
				reward: {
					id: "legacy_free",
					name: "Legacy Free Product",
					type: RewardType.FreeProduct,
					free_product_id: "legacy_plan",
					promo_codes: [{ code: "LEGACYFREE" }],
				},
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		});
		const legacyProgram = await rewardProgramRepo.insert({
			db: ctx.db,
			data: constructRewardProgram({
				rewardProgramData: {
					id: "legacy_program",
					when: RewardTriggerEvent.CustomerCreation,
					received_by: RewardReceivedBy.Referrer,
					internal_reward_id: legacyReward!.internal_id,
				},
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "states the internal_id of a free product",
			func: () =>
				autumnV2_3.catalogV2.previewUpdate({
					rewards: [
						coupon({ id: "summer", internalId: legacyReward!.internal_id }),
					],
				}),
		});
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "states the internal_id of a program",
			func: () =>
				autumnV2_3.catalogV2.previewUpdate({
					referral_programs: [
						{
							id: "friends",
							internal_id: legacyProgram.internal_id,
							reward_id: "summer",
							redeem_on: RewardTriggerEvent.CustomerCreation,
							received_by: RewardReceivedBy.All,
						},
					],
				}),
		});
	},
);
