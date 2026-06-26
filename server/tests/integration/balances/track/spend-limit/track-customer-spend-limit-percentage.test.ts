import { expect, test } from "bun:test";
import { type ApiCustomerV5, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";
import {
	expectCustomerFeatureCachedAndDb,
	expectCustomerSendEventBlocked,
} from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";

// usage_percentage spend limits: overage cap = (overage_limit/100) × Σ base
// allowance of main recurring plans (add-ons/prepaid/rollovers excluded).
// Resolved server-side only (no API field); D === 0 means no cap.

const getSpendLimit = (customer: ApiCustomerV5, featureId: string) =>
	customer.billing_controls?.spend_limits?.find(
		(limit) => limit.feature_id === featureId,
	);

// (a) Response echoes limit_type + the raw percent.
test.concurrent(
	`${chalk.yellowBright("percentage-spend-limit-a: single main recurring plan resolves percentage to absolute cap")}`,
	async () => {
		const includedAllowance = 100;
		const customerProduct = products.pro({
			id: "pct-spend-limit-a-pro",
			items: [
				items.monthlyMessages({ includedUsage: includedAllowance }),
				items.consumableMessages({ price: 0.5 }),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "track-customer-spend-limit-pct-a",
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
			overageLimit: 120,
			limitType: "usage_percentage",
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const spendLimit = getSpendLimit(customer, TestFeature.Messages);

		expect(spendLimit?.limit_type).toBe("usage_percentage");
		expect(spendLimit?.overage_limit).toBe(120);
	},
);

// (b) Enforced floor: 100 included + 120 overage = 220, blocked beyond.
test.concurrent(
	`${chalk.yellowBright("percentage-spend-limit-b: percentage cap enforced at resolved absolute overage")}`,
	async () => {
		const includedAllowance = 100;
		const customerProduct = products.pro({
			id: "pct-spend-limit-b-pro",
			items: [
				items.monthlyMessages({ includedUsage: includedAllowance }),
				items.consumableMessages({ price: 0.5, maxPurchase: 300 }),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "track-customer-spend-limit-pct-b",
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
			overageLimit: 120,
			limitType: "usage_percentage",
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 210,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: includedAllowance,
			remaining: 0,
			usage: 220,
			maxPurchase: 300,
			breakdownLength: 2,
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
		await expectCustomerSendEventBlocked({
			autumn: autumnV2_1,
			customerId,
			requestFeatureId: TestFeature.Messages,
			requiredBalance: 1,
			customer: {
				granted: includedAllowance,
				remaining: 0,
				usage: 220,
				maxPurchase: 300,
				breakdownLength: 2,
			},
		});
	},
);

// (c) Denominator sums multiple main recurring plans: (100 + 50) × 1.2 = 180 overage.
test.concurrent(
	`${chalk.yellowBright("percentage-spend-limit-c: percentage resolves against summed main recurring allowances")}`,
	async () => {
		// Distinct groups so both main plans stay active instead of one replacing the other.
		const proProduct = products.pro({
			id: "pct-spend-limit-c-pro",
			group: "pct-spend-limit-c-a",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.consumableMessages({ price: 0.5 }),
			],
		});
		const premiumProduct = products.pro({
			id: "pct-spend-limit-c-premium",
			group: "pct-spend-limit-c-b",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "track-customer-spend-limit-pct-c",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [proProduct, premiumProduct] }),
			],
			actions: [
				s.billing.attach({ productId: proProduct.id }),
				s.billing.attach({ productId: premiumProduct.id }),
			],
		});

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 120,
			limitType: "usage_percentage",
		});

		// Floor at 150 included + 180 overage = 330.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 330,
		});

		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 150,
			remaining: 0,
			usage: 330,
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
		await expectCustomerSendEventBlocked({
			autumn: autumnV2_1,
			customerId,
			requestFeatureId: TestFeature.Messages,
			requiredBalance: 1,
			customer: { granted: 150, remaining: 0, usage: 330 },
		});
	},
);

// (d) Add-ons excluded from the denominator: main 100 → 120 overage (not 240).
test.concurrent(
	`${chalk.yellowBright("percentage-spend-limit-d: recurring add-on allowance excluded from denominator")}`,
	async () => {
		const mainProduct = products.pro({
			id: "pct-spend-limit-d-pro",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.consumableMessages({ price: 0.5 }),
			],
		});
		const recurringAddOn = products.recurringAddOn({
			id: "pct-spend-limit-d-addon",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "track-customer-spend-limit-pct-d",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [mainProduct, recurringAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: mainProduct.id }),
				s.billing.attach({ productId: recurringAddOn.id }),
			],
		});

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 120,
			limitType: "usage_percentage",
		});

		// Granted aggregates both (200) but the cap uses main only → floor 320, not 440.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 320,
		});

		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 0,
			usage: 320,
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
		await expectCustomerSendEventBlocked({
			autumn: autumnV2_1,
			customerId,
			requestFeatureId: TestFeature.Messages,
			requiredBalance: 1,
			customer: { granted: 200, remaining: 0, usage: 320 },
		});
	},
);

// (e) No main recurring plan → denominator 0 → no cap; overage is not blocked.
test.concurrent(
	`${chalk.yellowBright("percentage-spend-limit-e: zero denominator imposes no cap")}`,
	async () => {
		const consumableProduct = products.oneOffAddOn({
			id: "pct-spend-limit-e-oneoff",
			items: [items.consumableMessages({ includedUsage: 100, price: 0.5 })],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "track-customer-spend-limit-pct-e",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [consumableProduct] }),
			],
			actions: [s.billing.attach({ productId: consumableProduct.id })],
		});

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 120,
			limitType: "usage_percentage",
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 500,
			overage_behavior: "reject",
		});

		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 600,
			breakdownLength: 1,
		});
	},
);

// (f) Control-based overage (overage_allowed, no pay-per-use price) is capped
// too, and accumulates across calls — regresses the per-call budget reset.
test.concurrent(
	`${chalk.yellowBright("percentage-spend-limit-f: overage_allowed (no price) overage capped by percentage limit")}`,
	async () => {
		const customerProduct = products.pro({
			id: "pct-spend-limit-f-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "track-customer-spend-limit-pct-f",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit_type: "usage_percentage",
						overage_limit: 120,
					},
				],
			},
		});
		await timeout(3000);

		// 100 included + 120 overage = 220, reached across separate calls.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 20,
		});

		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 220,
			breakdownLength: 1,
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
	},
);
