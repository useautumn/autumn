import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";
import { expectCustomerFeatureCachedAndDb } from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";
import {
	expectCustomerBalance,
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";

// overage_behavior: "overflow" — deduct the entire tracked value, driving the
// balance negative instead of clamping at 0, and punching through windowed
// usage limits. Spend limits (monetary caps) still clamp. Check is untouched:
// a negative balance or exhausted window still returns allowed: false.

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow1: overflow drives a plain metered balance negative; check and cap-mode tracks stay blocked")}`,
	async () => {
		const customerProduct = products.base({
			id: "overage-overflow-negative",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "overage-overflow-negative-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		// The API floors `remaining` at 0 by convention; the negative balance
		// (-50 underneath) surfaces as usage exceeding granted.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 150,
			overage_behavior: "overflow",
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 150,
		});

		const blocked = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(blocked.allowed).toBe(false);

		// Default cap mode still floors at the current balance: nothing applies.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 150,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow2: overflow punches through a usage limit; counter exceeds it and keeps blocking cap-mode tracks")}`,
	async () => {
		const customerProduct = products.base({
			id: "overage-overflow-window",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "overage-overflow-window-1";
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

		// 3 of 5 used: an overflow track of 10 applies all 10, not the 2 that fit.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
			overage_behavior: "overflow",
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 87,
			usage: 13,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 13,
			limit: 5,
		});

		// The window is exhausted (counter past the limit): cap-mode clamps to 0.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 87,
			usage: 13,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 13,
			limit: 5,
		});

		const blocked = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(blocked.allowed).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow3: a spend limit still clamps an overflow track")}`,
	async () => {
		const customerProduct = products.base({
			id: "overage-overflow-spend-limit",
			items: [
				items.lifetimeMessages({ includedUsage: 1000 }),
				items.consumableMessages({
					includedUsage: 100,
					maxPurchase: 300,
					price: 0.5,
				}),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "overage-overflow-spend-limit-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 25,
		});

		// 1100 granted + 20 overage consumed: 5 units of overage headroom left.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1120,
		});

		// overflow must NOT punch through the spend limit: only the 5 that fit apply.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
			overage_behavior: "overflow",
		});
		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 1100,
			remaining: 0,
			usage: 1125,
			maxPurchase: 300,
			breakdownLength: 2,
		});

		// At the cap, a further overflow track applies nothing.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
			overage_behavior: "overflow",
		});
		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 1100,
			remaining: 0,
			usage: 1125,
			maxPurchase: 300,
			breakdownLength: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow4: a negative value with overflow credits above the granted balance")}`,
	async () => {
		const customerProduct = products.base({
			id: "overage-overflow-refund",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "overage-overflow-refund-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -50,
			overage_behavior: "overflow",
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 120,
			usage: -20,
		});
	},
);
