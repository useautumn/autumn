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
		const promoCode = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "");
		const legacyFreeProduct = uniqueTestId("atmn_legacy_free");
		const legacyProgram = uniqueTestId("atmn_legacy_prog");

		const catalog = ({ rewards }: { rewards: string }) => `{
			features: [
				feature({ featureId: "${credits}", name: "Credits", type: "metered", consumable: true }),
			],
			plans: [
				plan({ active: true, planId: "${pro}", name: "Pro", versionSlug: "v1", }),
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
			const created = await scenario.push();
			expect(created.output).toContain(sale);
			expect(created.output).toContain(betaGrant);
			expect(created.output).toContain(refer);
			expect(await rewardIds({ ctx: scenario.ctx })).toEqual(
				[sale, betaGrant].sort(),
			);
			expect(await programIds({ ctx: scenario.ctx })).toEqual([refer]);

			const unchanged = await scenario.push();
			expect(unchanged.output).toContain("No changes");

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

			const legacyCatalog = await scenario.client.get({});
			expect(
				legacyCatalog.referralPrograms.map((program) => program.id),
			).not.toContain(legacyProgram);
			expect(
				legacyCatalog.rewards.map((reward) =>
					"coupon" in reward ? reward.coupon.id : reward.featureGrant.id,
				),
			).not.toContain(legacyFreeProduct);

			scenario.writeConfig(
				atmnConfigSource({
					body: catalog({ rewards: grantFixture }).replace(
						`id: "${refer}"`,
						`id: "${legacyProgram}"`,
					),
				}),
			);
			await expect(scenario.push({ dryRun: true })).rejects.toThrow(
				/already exists against a free product or invoice credit reward/,
			);
			scenario.writeConfig(
				atmnConfigSource({
					body: catalog({
						rewards: `${saleCoupon({ value: 35 })}${grantFixture}`,
					}),
				}),
			);

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
