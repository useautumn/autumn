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

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("ent-uw-credits1: entity cap on action1 over prepaid + consumable credits")}`,
	async () => {
		const prepaidQuantity = 300;
		const consumableIncluded = 200;
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

		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			value: 3,
		});

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

		const creditsCheck = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Credits,
			required_balance: 100,
		});
		expect(creditsCheck.allowed).toBe(true);
	},
);
