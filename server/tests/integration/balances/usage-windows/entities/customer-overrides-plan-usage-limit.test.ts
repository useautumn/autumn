/**
 * Customer usage_limit overrides the plan-default for the same feature: the
 * customer-tier entry wins the resolveBillingControl waterfall before the plan
 * fallback is consulted, so the cap is the customer's 100 — NOT the plan's 5.
 */

import { test } from "bun:test";
import { ApiVersion, ErrCode, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test(
	`${chalk.yellowBright("customer-overrides-plan-usage-limit: customer cap 100 wins over plan-default cap 5")}`,
	async () => {
		const prod = products.base({
			id: "customer-overrides-plan-usage-limit",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const customerId = "customer-overrides-plan-usage-limit-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod] }),
			],
			actions: [
				// Plan default usage_limit: 5.
				s.billing.attach({
					productId: prod.id,
					billingControls: {
						usage_limits: [
							{
								feature_id: TestFeature.Messages,
								enabled: true,
								limit: 5,
								interval: ResetInterval.Month,
							},
						],
					},
				}),
			],
		});

		// Customer overrides with a looser cap of 100.
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 100,
		});

		await autumnV2_3.customers.get(customerId);

		// Track 50 — far past the plan's 5, but within the customer's 100. The
		// customer cap takes priority, so this must NOT be rejected.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
			overage_behavior: "reject",
		});

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 50,
			limit: 100,
		});

		// Track 50 more -> 100 total, hitting the customer cap. The 101st rejects.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_3.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
	},
);
