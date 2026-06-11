import { expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { expectEntityFeatureBalance } from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";
import {
	expectEntityUsageLimit,
	setEntityUsageLimit,
} from "../../utils/usage-limit-utils/entityUsageLimitUtils.js";

/**
 * TDD test for an ENTITY-LEVEL usage limit on action1 when the entity is
 * funded by prepaid + consumable CREDITS (metered cap on a credit-system
 * member feature; 1 action1 unit = 0.2 credits).
 *
 * Contract under test:
 *  - check on action1 (entity subject) is gated by the entity cap's remaining
 *    headroom in ACTION1 UNITS, while hundreds of credits remain
 *  - track clamps at the cap: only the allowed units drain credits
 *    (prepaid + consumable cusEnts, breakdown 2)
 *  - over-cap track with reject -> InsufficientBalance
 *  - entities.get reports the cap's window usage
 *  - a direct credits check is NOT gated by the action1 cap
 */

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("ent-uw-credits1: entity cap on action1 over prepaid + consumable credits")}`,
	async () => {
		const prepaidQuantity = 300;
		const consumableIncluded = 200;
		// granted = prepaid quantity + consumable included usage, per entity.
		const grantedCredits = prepaidQuantity + consumableIncluded;
		const action1CreditCost = 0.2;

		const perEntityProduct = products.base({
			id: "ent-uw-credits-prepaid-consumable",
			items: [
				items.prepaid({
					featureId: TestFeature.Credits,
					includedUsage: 100,
					billingUnits: 100,
					price: 8.5,
					entityFeatureId: TestFeature.Users,
				}),
				items.consumable({
					featureId: TestFeature.Credits,
					includedUsage: consumableIncluded,
					price: 0.5,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-credits-1";
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: perEntityProduct.id,
					options: [
						{ feature_id: TestFeature.Credits, quantity: prepaidQuantity },
					],
				}),
			],
		});

		await setEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		// ── 3 of 5 units used (= 0.6 credits) ──
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			value: 3,
		});

		// ── Check converts cap headroom in action1 units: 2 left ──
		const within = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			required_balance: 2,
		});
		expect(within.allowed).toBe(true);

		const beyond = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			required_balance: 3,
		});
		expect(beyond.allowed).toBe(false);

		// ── Over-cap track clamps: 4 requested, 2 applied (5 total = 1 credit) ──
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			value: 4,
		});

		await expectEntityFeatureBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Credits,
			granted: grantedCredits,
			remaining: grantedCredits - 5 * action1CreditCost,
			usage: 5 * action1CreditCost,
			breakdownLength: 2,
		});
		await expectEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Action1,
			usage: 5,
			limit: 5,
		});

		// ── Cap exhausted: reject fires while ~499 credits remain ──
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_3.track({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Action1,
					value: 1,
					overage_behavior: "reject",
				}),
		});

		// ── A direct credits check is not gated by the action1 cap ──
		const creditsCheck = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Credits,
			required_balance: 100,
		});
		expect(creditsCheck.allowed).toBe(true);
	},
);
