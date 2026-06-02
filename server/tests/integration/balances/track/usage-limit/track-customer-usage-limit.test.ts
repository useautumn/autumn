import { expect, test } from "bun:test";
import { type CustomerBillingControls, EntInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type AutumnV2_1Client = Awaited<ReturnType<typeof initScenario>>["autumnV2_1"];

// Arms a windowed usage cap via spend_limits[].usage_limit (overage off);
// `interval` sets the explicit window override.
const setCustomerUsageLimit = async ({
	autumn,
	customerId,
	featureId,
	limit,
	interval = EntInterval.Month,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	featureId: string;
	limit: number;
	interval?: EntInterval;
}) => {
	const billingControls: CustomerBillingControls = {
		spend_limits: [
			{
				feature_id: featureId,
				enabled: false,
				usage_limit: limit,
				usage_limit_interval: interval,
			},
		],
	};

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

		const customerId = `track-customer-usage-limit-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
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

		// Consume exactly up to the cap: 5 action1 units = 1 credit deducted. Assert
		// the synchronous track response; a re-read races the async write-through.
		const consumed = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});
		expect(consumed.balances?.[TestFeature.Credits]).toMatchObject({
			feature_id: TestFeature.Credits,
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
		// 400 not 429: clients flatten a 429 to a generic rate_limit_exceeded.
		expect(blockedCode).toBe("usage_limit_exceeded");
	},
);

test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit2: credit-pool sub-interval cap (1 credit/day) blocks while monthly credits remain")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-credit-day-cap",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `track-customer-credit-day-cap-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		// 1 action1 = 0.2 credits, so 5 action1 = exactly 1 credit (the daily cap).
		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Credits,
			limit: 1,
			interval: EntInterval.Day,
		});

		const consumed = await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});
		expect(consumed.balances?.[TestFeature.Credits]).toMatchObject({
			feature_id: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});

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
		expect(blockedCode).toBe("usage_limit_exceeded");
	},
);

// set_usage must be rejected when the feature has an enforced usage window;
// otherwise it bypasses the hard cap (it carries no window provenance).
test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit3: set_usage is rejected when the feature has a usage window")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-setusage-guard",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = `track-customer-setusage-guard-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		let blockedCode: string | undefined;
		try {
			await autumnV2_1.balances.update({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				current_balance: 50,
			});
		} catch (error) {
			blockedCode = (error as { code?: string }).code;
		}

		expect(blockedCode).toBe("set_usage_not_allowed_with_usage_limit");
	},
);

// A single spend_limit entry carrying BOTH an overage_limit and a windowed usage
// cap must still enforce the window (the two caps are independent).
test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit4: a spend_limit with both overage_limit and a usage window still enforces the window")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-compound-cap",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `track-customer-compound-cap-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		const billingControls: CustomerBillingControls = {
			spend_limits: [
				{
					feature_id: TestFeature.Action1,
					enabled: true,
					overage_limit: 20,
					usage_limit: 5,
					usage_limit_interval: EntInterval.Month,
				},
			],
		};
		await timeout(2000);
		await autumnV2_1.customers.update(customerId, {
			billing_controls: billingControls,
		});
		await timeout(3000);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		let blockedCode: string | undefined;
		try {
			await autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 1,
			});
		} catch (error) {
			blockedCode = (error as { code?: string }).code;
		}

		expect(blockedCode).toBe("usage_limit_exceeded");
	},
);

// Two concurrent tracks on the SAME customer's SAME window must serialize (Redis
// runs each deduction Lua atomically): combined value exceeds the cap, so exactly
// one succeeds and one is rejected, and the counter reflects only the winner.
test.concurrent(
	`${chalk.yellowBright("track-customer-usage-limit6: concurrent tracks on one window serialize, one rejected")}`,
	async () => {
		const customerProduct = products.base({
			id: "track-customer-concurrent-cap",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `track-customer-concurrent-cap-1-${Date.now()}`;
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		// Cap action1 at 5/month; two concurrent tracks of 5 each => combined 10 > 5.
		await setCustomerUsageLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		const results = await Promise.allSettled([
			autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 5,
			}),
			autumnV2_1.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 5,
			}),
		]);

		const fulfilled = results.filter((result) => result.status === "fulfilled");
		const rejected = results.filter(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0].reason as { code?: string }).code).toBe(
			"usage_limit_exceeded",
		);
	},
);
