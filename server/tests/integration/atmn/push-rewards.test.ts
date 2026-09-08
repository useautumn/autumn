/**
 * atmn push — coupons, feature grants and referral programs as config.
 *
 * The whole point of the lane: a reward is stated in the same full-state
 * document as plans and features, so omission removes it and a pull writes
 * back what the server holds. Free-product rewards are the exception the
 * catalog must never touch, and that is asserted with a real one in the org.
 *
 * Contract:
 *   R1  a config with rewards + a referral program creates them
 *   R2  re-pushing an unchanged config is a no-op
 *   R3  editing a reward previews as an update and applies
 *   R4  omitting a reward under full state removes it
 *   R5  a free-product reward is invisible: never previewed, never removed
 *   R6  a config claiming a free product's id is refused
 *   R7  pull writes the server's rewards back into the config
 *   R8  a referral program backed by a free product is invisible too
 */

import { expect, test } from "bun:test";
import {
	RewardReceivedBy,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	rewardProgramRepo,
	rewardRepo,
} from "@/internal/rewards/repos/index.js";
import {
	constructReward,
	constructRewardProgram,
} from "@/internal/rewards/rewardUtils.js";
import { uniqueTestId } from "../catalog-v2/utils/uniqueTestId.js";

const rewardIds = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<string[]> => {
	const rows = await rewardRepo.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return rows.map((row) => row.id).sort();
};

const programIds = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<string[]> => {
	const rows = await rewardProgramRepo.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return rows.map((row) => row.id).sort();
};

test.concurrent(
	`${chalk.yellowBright("atmn push: rewards and referral programs as config")}`,
	async () => {
		const credits = uniqueTestId("atmn_credits");
		const pro = uniqueTestId("atmn_pro");
		const sale = uniqueTestId("atmn_sale");
		const betaGrant = uniqueTestId("atmn_beta");
		const refer = uniqueTestId("atmn_refer");
		// Stripe only accepts letters and digits in a promo code.
		const promoCode = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "");
		const legacyFreeProduct = uniqueTestId("atmn_legacy_free");
		const legacyProgram = uniqueTestId("atmn_legacy_prog");

		const catalog = ({ rewards }: { rewards: string }) => `{
			features: [
				feature({ featureId: "${credits}", name: "Credits", type: "metered", consumable: true }),
			],
			plans: [
				plan({ planId: "${pro}", name: "Pro" }),
			],
			rewards: [${rewards}],
			referralPrograms: [
				referralProgram({
					id: "${refer}",
					rewardId: "${betaGrant}",
					redeemOn: "customer_creation",
					receivedBy: "referrer",
					maxRedemptions: 10,
				}),
			],
		}`;

		const saleCoupon = ({ value }: { value: number }) => `
			coupon({
				id: "${sale}",
				name: "Summer Sale",
				type: "percentage_discount",
				value: ${value},
				duration: { type: "months", length: 3 },
				planIds: ["${pro}"],
				promoCodes: [{ code: "${promoCode(sale)}" }],
			}),`;

		const grantFixture = `
			featureGrant({
				id: "${betaGrant}",
				name: "Beta Credits",
				grants: [{ featureId: "${credits}", included: 1000, expiry: null }],
				promoCodes: [{ code: "${promoCode(betaGrant)}", maxUses: 500 }],
			}),`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: catalog({
				rewards: `${saleCoupon({ value: 20 })}${grantFixture}`,
			}),
		});

		try {
			// R1: the config's rewards and program land in the catalog.
			const created = await scenario.push();
			expect(created.output).toContain(sale);
			expect(created.output).toContain(betaGrant);
			expect(created.output).toContain(refer);
			expect(await rewardIds({ ctx: scenario.ctx })).toEqual(
				[sale, betaGrant].sort(),
			);
			expect(await programIds({ ctx: scenario.ctx })).toEqual([refer]);

			// R2: nothing changed, so nothing is proposed.
			const unchanged = await scenario.push();
			expect(unchanged.output).toContain("No changes");

			// R3: a changed value is an update, not a delete and a create.
			scenario.writeConfig(
				atmnConfigSource({
					body: catalog({
						rewards: `${saleCoupon({ value: 35 })}${grantFixture}`,
					}),
				}),
			);
			const edited = await scenario.preview();
			const editedRewards = edited.rewards as {
				id: string;
				action: string;
				previousAttributes: Record<string, unknown> | null;
			}[];
			const editedCoupon = editedRewards.find((row) => row.id === sale);
			expect(editedCoupon?.action).toBe("update");
			expect(editedCoupon?.previousAttributes?.value).toBe(20);
			await scenario.push();

			// R5: a free-product reward the config can never state.
			const [legacyReward] = await rewardRepo.insert({
				db: scenario.ctx.db,
				data: constructReward({
					reward: {
						id: legacyFreeProduct,
						name: "Legacy Free Product",
						type: RewardType.FreeProduct,
						free_product_id: pro,
						promo_codes: [{ code: promoCode(legacyFreeProduct) }],
					},
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
				}),
			});
			// R8: and a program hanging off it. Neither is statable, so pull must
			// not write the program either — its reward would be a dangling ref.
			await rewardProgramRepo.insert({
				db: scenario.ctx.db,
				data: constructRewardProgram({
					rewardProgramData: {
						id: legacyProgram,
						when: RewardTriggerEvent.CustomerCreation,
						received_by: RewardReceivedBy.Referrer,
						internal_reward_id: legacyReward.internal_id,
					},
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
				}),
			});

			// R8: neither the legacy reward nor the program hanging off it is
			// visible to the catalog — a stated program would name a reward the
			// catalog never returns, and the config would not lint.
			const legacyCatalog = await scenario.client.get({});
			expect(
				legacyCatalog.referralPrograms.map((program) => program.id),
			).not.toContain(legacyProgram);
			expect(
				legacyCatalog.rewards.map((reward) =>
					"coupon" in reward ? reward.coupon.id : reward.featureGrant.id,
				),
			).not.toContain(legacyFreeProduct);

			// R4 + R5: dropping the coupon removes it; the free product is not
			// even mentioned, let alone proposed for removal.
			scenario.writeConfig(
				atmnConfigSource({ body: catalog({ rewards: grantFixture }) }),
			);
			const removal = await scenario.preview();
			const removalRewards = removal.rewards as {
				id: string;
				action: string;
			}[];
			expect(removalRewards.find((row) => row.id === sale)?.action).toBe(
				"delete",
			);
			expect(removalRewards.some((row) => row.id === legacyFreeProduct)).toBe(
				false,
			);
			await scenario.push();
			expect(await rewardIds({ ctx: scenario.ctx })).toEqual(
				[betaGrant, legacyFreeProduct].sort(),
			);

			// R6: claiming the free product's id is refused rather than silently
			// rewriting a row the config could never state back.
			scenario.writeConfig(
				atmnConfigSource({
					body: catalog({
						rewards: `${grantFixture}
						coupon({
							id: "${legacyFreeProduct}",
							name: "Hijack",
							type: "fixed_discount",
							value: 5,
							duration: { type: "one_off", length: null },
							planIds: null,
							promoCodes: [{ code: "HIJACK" }],
						}),`,
					}),
				}),
			);
			await expect(scenario.push({ dryRun: true })).rejects.toThrow(
				legacyFreeProduct,
			);

			// R7: pull writes the coupon the server still holds back into the config.
			scenario.writeConfig(
				atmnConfigSource({ body: catalog({ rewards: grantFixture }) }),
			);
			await scenario.push();
			scenario.writeConfig(
				atmnConfigSource({
					body: catalog({
						rewards: `${grantFixture}${saleCoupon({ value: 20 })}`,
					}),
				}),
			);
			await scenario.push();
			scenario.writeConfig(
				atmnConfigSource({ body: catalog({ rewards: grantFixture }) }),
			);
			const pulled = await scenario.pull();
			expect(pulled.appended).toContain(sale);
			const wire = (await scenario.wireFromConfig()) as {
				rewards?: {
					coupon?: { id?: string };
					feature_grant?: { id?: string };
				}[];
			};
			expect(
				(wire.rewards ?? [])
					.map((row) => row.coupon?.id ?? row.feature_grant?.id)
					.sort(),
			).toEqual([sale, betaGrant].sort());
		} finally {
			scenario.cleanup();
		}
	},
	600_000,
);
