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
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rewards: a known internal_id under another id is still a rename")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({
			customerId: "cv2-reward-known-iid-rename",
			setup: [s.platform.create({ setupDefaultFeatures: true })],
			actions: [],
		});

		const created = await autumnV2_3.catalogV2.update({
			rewards: [
				{
					coupon: {
						id: "summer",
						name: "Summer",
						type: RewardType.PercentageDiscount,
						value: 10,
						duration: { type: CouponDurationType.Months, length: 1 },
						plan_ids: null,
						promo_codes: [],
					},
				},
			],
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
						{
							coupon: {
								id: "winter",
								internal_id: summerInternalId ?? undefined,
								name: "Winter",
								type: RewardType.PercentageDiscount,
								value: 10,
								duration: { type: CouponDurationType.Months, length: 1 },
								plan_ids: null,
								promo_codes: [],
							},
						},
					],
				}),
		});
	},
);
