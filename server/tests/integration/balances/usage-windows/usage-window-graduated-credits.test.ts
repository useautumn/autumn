import { test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("usage-window-graduated-credits1: a draw across a tier boundary counts the credits it cost")}`,
	async () => {
		const creditPlan = products.base({
			id: "uw-graduated-credits",
			items: [
				items.consumable({
					featureId: TestFeature.TieredCredits,
					includedUsage: 1_000,
					price: 1,
					billingUnits: 1,
				}),
			],
		});
		const customerId = "uw-graduated-credits-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [creditPlan] }),
			],
			actions: [s.billing.attach({ productId: creditPlan.id })],
		});
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.TieredCredits,
			limit: 500,
			interval: ResetInterval.Day,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 9_950,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.TieredCredits,
			usage: 99.5,
			limit: 500,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 100,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.TieredCredits,
			usage: 100.4,
			limit: 500,
		});
	},
);
