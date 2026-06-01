import { expect, test } from "bun:test";
import type { CustomerBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCustomerFeatureCachedAndDb } from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";

type AutumnV2_1Client = Awaited<ReturnType<typeof initScenario>>["autumnV2_1"];

/**
 * Sets a per-feature usage-window cap on a customer via the new `usage_limits`
 * billing control. Mirrors `setCustomerSpendLimit`, but the cap is on the
 * member feature's COUNT (hard limit), not on credit-pool overage.
 *
 * `usage_limits` does not exist on `CustomerBillingControls` yet; this is the
 * config surface the feature introduces. Cast through `unknown` so the test
 * expresses the intended shape ahead of the schema landing.
 */
const setCustomerUsageLimit = async ({
	autumn,
	customerId,
	featureId,
	limit,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	featureId: string;
	limit: number;
}) => {
	const billingControls = {
		usage_limits: [
			{ feature_id: featureId, enabled: true, limit, interval: "month" },
		],
	} as unknown as CustomerBillingControls;

	await timeout(2000);
	await autumn.customers.update(customerId, {
		billing_controls: billingControls,
	});
	await timeout(3000);
};

// Credit system: 100 credits, 1 action1 = 0.2 credits (see v2Features.ts).
// A cap of 5 action1 units consumes only 1 credit, so the cap must block the
// 6th unit while ~99 credits remain, proving it's a second, independent
// dimension, not a balance check.
test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit1: per-feature cap blocks deduction while credits remain")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-usage-limit",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "track-customer-usage-limit-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		// Consume exactly up to the cap: 5 action1 units = 1 credit deducted.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});

		// The 6th unit exceeds the cap. It must be hard-blocked BEFORE any
		// deduction, even though ~99 credits remain.
		let blocked = false;
		let blockedCode: string | undefined;
		try {
			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 1,
			});
		} catch (error) {
			blocked = true;
			blockedCode = (error as { code?: string }).code;
		}

		expect(blocked).toBe(true);
		// The rejection must surface as usage_limit_exceeded, not a generic
		// rate_limit_exceeded. Clients flatten any HTTP 429 to rate_limit_exceeded
		// before reading the body, so UsageLimitExceededError returns 400 to keep
		// the specific code legible to callers.
		expect(blockedCode).toBe("usage_limit_exceeded");

		// And critically: the blocked track must not have moved the credit balance.
		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});
	},
);
