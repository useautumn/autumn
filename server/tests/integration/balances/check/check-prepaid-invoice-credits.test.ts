/**
 * Contract: invoice-credit plan items no longer need usage-based pricing.
 * A prepaid or included-only invoice-credit balance converts check's
 * required_balance at the rate card and stops at zero instead of going into
 * overage.
 *
 * Catalog rate for Action1 in InvoiceCredits is 0.2 credits/unit (v2Features.ts).
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("check-prepaid-invoice-credits: prepaid balance converts at the rate card and stops at zero")}`,
	async () => {
		const customerId = "check-prepaid-invoice-credits";
		const plan = products.base({
			id: "prepaid-invoice-credits",
			items: [
				items.monthlyPrice({ price: 20 }),
				items.prepaid({
					featureId: TestFeature.InvoiceCredits,
					price: 1,
					billingUnits: 1,
				}),
			],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.InvoiceCredits, quantity: 100 }],
				}),
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.InvoiceCredits]).toMatchObject({
			balance: 100,
		});

		// 10 units * 0.2 = 2 credits.
		const allowed = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 10,
		});
		expect(allowed).toMatchObject({ allowed: true, required_balance: 2 });

		// 500 units * 0.2 = 100 credits drains the prepaid balance.
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 500,
		});

		const denied = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 10,
		});
		expect(denied).toMatchObject({ allowed: false, required_balance: 2 });
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("check-prepaid-invoice-credits: included-only balance converts at the rate card and stops at zero")}`,
	async () => {
		const customerId = "check-included-invoice-credits";
		const plan = products.base({
			id: "included-invoice-credits",
			items: [
				items.monthlyPrice({ price: 20 }),
				items.free({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: 50,
				}),
			],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		// 100 units * 0.2 = 20 credits.
		const allowed = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 100,
		});
		expect(allowed).toMatchObject({ allowed: true, required_balance: 20 });

		// 250 units * 0.2 = 50 credits drains the included balance.
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 250,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.InvoiceCredits]).toMatchObject({
			balance: 0,
			usage: 50,
		});

		const denied = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 5,
		});
		expect(denied).toMatchObject({ allowed: false, required_balance: 1 });
	},
	{ timeout: 120_000 },
);
