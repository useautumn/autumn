import { test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	type CustomerBillingControls,
	ResetInterval,
} from "@autumn/shared";
import { expectUsageLimitCorrect } from "@tests/integration/utils/expectUsageLimitCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setCustomerUsageLimit } from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

// Usage-window API surface: what the HTTP contract exposes and guards around
// windowed caps (not deduction outcomes).

// initScenario only exposes clients up to V2_2; build the latest-version client
// directly (same pattern as the v2.2-vs-v2.3 parity tests).
const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// The usage_limits entry in the customer response exposes the current window
// usage.
test.concurrent(
	`${chalk.yellowBright("usage-window-api1: usage_limits exposes the current window usage")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-api-counter",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-api-counter-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectUsageLimitCorrect({
			customer,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
			interval: ResetInterval.Month,
		});
	},
);

// usage_limits entries are strictly validated on write: limit, interval, and
// feature_id are all required, and one_off (never-resetting) windows are not
// supported.
test.concurrent(
	`${chalk.yellowBright("usage-window-api3: usage_limits entries are validated (interval required, no one_off)")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-api-validate",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-api-validate-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		// Missing interval.
		await expectAutumnError({
			func: async () =>
				await autumnV2_3.customers.update(customerId, {
					billing_controls: {
						usage_limits: [{ feature_id: TestFeature.Messages, limit: 5 }],
					} as unknown as CustomerBillingControls,
				}),
		});

		// one_off window.
		await expectAutumnError({
			func: async () =>
				await autumnV2_3.customers.update(customerId, {
					billing_controls: {
						usage_limits: [
							{
								feature_id: TestFeature.Messages,
								limit: 5,
								interval: "one_off",
							},
						],
					} as unknown as CustomerBillingControls,
				}),
		});

		// Missing limit.
		await expectAutumnError({
			func: async () =>
				await autumnV2_3.customers.update(customerId, {
					billing_controls: {
						usage_limits: [
							{ feature_id: TestFeature.Messages, interval: "month" },
						],
					} as unknown as CustomerBillingControls,
				}),
		});

		// Duplicate feature_id entries.
		await expectAutumnError({
			func: async () =>
				await autumnV2_3.customers.update(customerId, {
					billing_controls: {
						usage_limits: [
							{
								feature_id: TestFeature.Messages,
								limit: 5,
								interval: "month",
							},
							{
								feature_id: TestFeature.Messages,
								limit: 10,
								interval: "day",
							},
						],
					} as unknown as CustomerBillingControls,
				}),
		});
	},
);
