import { expect, test } from "bun:test";
import {
	AppEnv,
	apiKeys,
	type CreateReferralProgramParams,
	RewardReceivedBy,
	RewardTriggerEvent,
	Scopes,
	type UpdateCatalogParamsInput,
	type UpdateCatalogRewardParams,
} from "@autumn/shared";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { hashApiKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { createClient } from "../../../../packages/atmn/src/generated/client";
import { uniqueTestId } from "../catalog-v2/utils/uniqueTestId.js";

const seedScopedKey = async ({
	ctx,
	scopes,
}: {
	ctx: AutumnContext;
	scopes: string[];
}): Promise<string> => {
	const key = `am_sk_test_${generateId("scoped")}`;
	await ctx.db.insert(apiKeys).values({
		id: generateId("key"),
		org_id: ctx.org.id,
		user_id: null,
		name: `atmn-rewards-scope-${Date.now()}`,
		prefix: key.substring(0, 14),
		created_at: Date.now(),
		env: AppEnv.Sandbox,
		hashed_key: hashApiKey(key),
		meta: {},
		scopes,
	});
	return key;
};

const promoCode = (id: string): string => id.replace(/[^a-zA-Z0-9]/g, "");

const couponParams = ({
	id,
	planIds,
	value = 10,
}: {
	id: string;
	planIds: string[] | null;
	value?: number;
}): UpdateCatalogRewardParams => ({
	coupon: {
		id,
		name: "Sale",
		type: "percentage_discount" as never,
		value,
		duration: { type: "one_off" as never, length: null },
		plan_ids: planIds,
		promo_codes: [{ code: promoCode(id) }],
	},
});

const programParams = ({
	id,
	rewardId,
}: {
	id: string;
	rewardId: string;
}): CreateReferralProgramParams => ({
	id,
	reward_id: rewardId,
	redeem_on: RewardTriggerEvent.CustomerCreation,
	received_by: RewardReceivedBy.Referrer,
	max_redemptions: 5,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 rewards: a narrowed key cannot read reward data")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: "{ features: [], plans: [] }",
		});

		try {
			const narrowed = createClient({
				secretKey: await seedScopedKey({
					ctx: scenario.ctx,
					scopes: [Scopes.Plans.Read, Scopes.Features.Read],
				}),
				baseUrl: scenario.baseUrl,
			});

			await expect(narrowed.get({})).rejects.toThrow(/scope/i);
		} finally {
			scenario.cleanup();
		}
	},
	600_000,
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rewards: partial payloads are refused before any write")}`,
	async () => {
		const pro = uniqueTestId("atmn_pro");
		const sale = uniqueTestId("atmn_sale");
		const refer = uniqueTestId("atmn_refer");
		const renamedPlan = uniqueTestId("atmn_renamed");
		const ghostPlan = uniqueTestId("atmn_ghost");
		const freshSale = uniqueTestId("atmn_fresh");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: "{ features: [], plans: [] }",
		});

		try {
			const base: UpdateCatalogParamsInput = {
				plans: [{ plan_id: pro, name: "Pro" }],
				rewards: [couponParams({ id: sale, planIds: [pro] })],
				referral_programs: [programParams({ id: refer, rewardId: sale })],
				skip_deletions: false,
			};
			await scenario.client.update(base as never);

			await expect(
				scenario.client.update({
					plans: base.plans,
					rewards: [],
					skip_deletions: false,
				} as never),
			).rejects.toThrow(refer);

			await expect(
				scenario.client.update({
					plans: [{ plan_id: pro, new_plan_id: renamedPlan, name: "Pro" }],
					rewards: [],
					skip_deletions: false,
				} as never),
			).rejects.toThrow(refer);
			const afterFailure = await scenario.client.get({});
			expect(afterFailure.plans.map((plan) => plan.id)).toContain(pro);

			await expect(
				scenario.client.update({
					...base,
					rewards: [couponParams({ id: sale, planIds: [ghostPlan] })],
				} as never),
			).rejects.toThrow(ghostPlan);

			const partial = await scenario.client.update({
				rewards: [
					couponParams({ id: sale, planIds: [pro] }),
					couponParams({ id: freshSale, planIds: [pro] }),
				],
				referral_programs: base.referral_programs,
			} as never);

			const created = (partial.results.rewards ?? []).find(
				(applied) => applied.id === freshSale,
			);
			expect(created?.action).toBe("create");
			expect(typeof created?.internalId).toBe("string");
			expect(created?.internalId?.length ?? 0).toBeGreaterThan(0);

			const ghostCoupon = uniqueTestId("atmn_ghost_coupon");
			await expect(
				scenario.client.update({
					plans: [{ plan_id: pro, new_plan_id: renamedPlan, name: "Pro" }],
					rewards: [couponParams({ id: ghostCoupon, planIds: [ghostPlan] })],
				} as never),
			).rejects.toThrow(ghostPlan);
			const afterGhost = await scenario.client.get({});
			expect(afterGhost.plans.map((plan) => plan.id)).toContain(pro);

			await expect(
				scenario.client.update({
					plans: [{ plan_id: pro, new_plan_id: renamedPlan, name: "Pro" }],
					rewards: [couponParams({ id: sale, planIds: [pro], value: 20 })],
				} as never),
			).rejects.toThrow(pro);
			const afterVacated = await scenario.client.get({});
			expect(afterVacated.plans.map((plan) => plan.id)).toContain(pro);

			await scenario.client.update({
				plans: [{ plan_id: pro, new_plan_id: renamedPlan, name: "Pro" }],
				rewards: [
					couponParams({ id: sale, planIds: [renamedPlan], value: 20 }),
				],
			} as never);
			const afterRename = await scenario.client.get({});
			expect(afterRename.plans.map((plan) => plan.id)).toContain(renamedPlan);

			await expect(
				scenario.client.update({
					remove_plans: [{ plan_id: renamedPlan }],
					rewards: [
						couponParams({ id: sale, planIds: [renamedPlan], value: 30 }),
					],
				} as never),
			).rejects.toThrow(renamedPlan);
			const afterRemoval = await scenario.client.get({});
			expect(afterRemoval.plans.map((plan) => plan.id)).toContain(renamedPlan);
		} finally {
			scenario.cleanup();
		}
	},
	600_000,
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rewards: a replacement reward can keep the promo code")}`,
	async () => {
		const first = uniqueTestId("atmn_first");
		const second = uniqueTestId("atmn_second");
		const sharedCode = promoCode(uniqueTestId("SHARED"));

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: "{ features: [], plans: [] }",
		});

		try {
			const withCode = ({ id }: { id: string }): UpdateCatalogRewardParams => {
				const params = couponParams({ id, planIds: null });
				if (!("coupon" in params)) throw new Error("expected a coupon");
				return {
					coupon: { ...params.coupon, promo_codes: [{ code: sharedCode }] },
				};
			};

			await scenario.client.update({
				rewards: [withCode({ id: first })],
				skip_deletions: false,
			} as never);

			await scenario.client.update({
				rewards: [withCode({ id: second })],
				skip_deletions: false,
			} as never);

			const catalog = await scenario.client.get({});
			expect(
				catalog.rewards.map((reward) =>
					"coupon" in reward ? reward.coupon.id : reward.featureGrant.id,
				),
			).toEqual([second]);
		} finally {
			scenario.cleanup();
		}
	},
	600_000,
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rewards: a program can be repointed to a new reward")}`,
	async () => {
		const oldReward = uniqueTestId("atmn_old");
		const newReward = uniqueTestId("atmn_new");
		const refer = uniqueTestId("atmn_refer");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: "{ features: [], plans: [] }",
		});

		try {
			await scenario.client.update({
				rewards: [couponParams({ id: oldReward, planIds: null })],
				referral_programs: [programParams({ id: refer, rewardId: oldReward })],
				skip_deletions: false,
			} as never);

			await scenario.client.update({
				rewards: [couponParams({ id: newReward, planIds: null })],
				referral_programs: [programParams({ id: refer, rewardId: newReward })],
				skip_deletions: false,
			} as never);

			const catalog = await scenario.client.get({});
			expect(
				catalog.rewards.map((reward) =>
					"coupon" in reward ? reward.coupon.id : reward.featureGrant.id,
				),
			).toEqual([newReward]);
			expect(
				catalog.referralPrograms.map((program) => program.rewardId),
			).toEqual([newReward]);
		} finally {
			scenario.cleanup();
		}
	},
	600_000,
);
