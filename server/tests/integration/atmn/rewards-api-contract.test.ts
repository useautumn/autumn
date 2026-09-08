/**
 * The reward lane as the API contract, not as atmn drives it.
 *
 * atmn always sends a complete, self-consistent, fully-scoped document, so the
 * push-rewards e2e can never reach these paths. Each case here is a shape only
 * a raw API caller (or a legacy org) produces.
 *
 * Red (before the fix):
 *  - S1  catalogV2.get returns rewards to a key without rewards:read
 *  - S2  a reward removal linked by an unstated program fails inside execute,
 *        after features and plans have already written
 *  - S3  repointing a program to a new reward deletes the old one first and 4xx's
 *  - S4  a coupon naming a plan the catalog lacks fails inside execute
 *  - S5  a created reward reports no stable id, so push cannot pin its fixture
 *  - S6  a rewards-only payload rejects a coupon naming a plan the org holds
 *
 * Green (after):
 *  - S1  403 before any reward row is read
 *  - S2  400 in the errors phase, nothing written
 *  - S3  the program is repointed, then the old reward removed
 *  - S4  400 in the errors phase, nothing written
 *  - S5  the applied result carries the id the row received
 *  - S6  a plan the payload leaves untouched still counts as present
 */

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
import { createClient } from "../../../../packages/atmn-nightly/src/generated/client";
import { uniqueTestId } from "../catalog-v2/utils/uniqueTestId.js";

/** A key carrying exactly the scopes named, so the gate can be observed. */
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
}: {
	id: string;
	planIds: string[] | null;
}): UpdateCatalogRewardParams => ({
	coupon: {
		id,
		name: "Sale",
		type: "percentage_discount" as never,
		value: 10,
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

			// S1: rewards are reward-scoped data, wherever they are served from.
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

			// S2: the payload speaks for rewards but not programs, so the omission
			// sweep would delete a reward the untouched program still links.
			await expect(
				scenario.client.update({
					plans: base.plans,
					rewards: [],
					skip_deletions: false,
				} as never),
			).rejects.toThrow(refer);

			// The refusal came before any write: the plan rename in the same
			// payload did not land.
			await expect(
				scenario.client.update({
					plans: [{ plan_id: pro, new_plan_id: renamedPlan, name: "Pro" }],
					rewards: [],
					skip_deletions: false,
				} as never),
			).rejects.toThrow(refer);
			const afterFailure = await scenario.client.get({});
			expect(afterFailure.plans.map((plan) => plan.id)).toContain(pro);

			// S4: a coupon naming a plan the catalog does not have is refused in
			// the errors phase, not inside the reward write.
			await expect(
				scenario.client.update({
					...base,
					rewards: [couponParams({ id: sale, planIds: [ghostPlan] })],
				} as never),
			).rejects.toThrow(ghostPlan);

			// S6: a payload that never mentions plans leaves them untouched, so a
			// coupon may still name one the org holds.
			const partial = await scenario.client.update({
				rewards: [
					couponParams({ id: sale, planIds: [pro] }),
					couponParams({ id: freshSale, planIds: [pro] }),
				],
				referral_programs: base.referral_programs,
			} as never);

			// S5: a created row reports the stable id it received, which is what
			// pins the fixture on the next push.
			const created = (partial.results.rewards ?? []).find(
				(applied) => applied.id === freshSale,
			);
			expect(created?.action).toBe("create");
			expect(typeof created?.internalId).toBe("string");
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

			// S3: the program moves to a reward this same push creates, and the
			// one it leaves behind is dropped. The old reward can only be deleted
			// after the program stops pointing at it.
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
