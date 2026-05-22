/**
 * TDD test for auto-preservation of one-off prepaid balances on multiAttach
 * transitions.
 *
 * Contract under test:
 *   When billing.multiAttach replaces an existing main customer product that
 *   holds a one-off prepaid customer_entitlement with balance > 0, the
 *   remaining units are auto-preserved as a lifetime cusEnt on the new product.
 *
 * Pre-impl red: balance after multiAttach reflects only the new plan's
 *   contributions (preserved units dropped when the outgoing cusProduct expires).
 * Post-impl green: cusProductToOneOffPrepaidCarryOvers is invoked from the
 *   common immediateMultiProduct compute path, mirroring the attach pipeline.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────────────────
// 1. multiAttach upgrade pro+one-off-prepaid → premium preserves 150 units.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("one-off-preserve multiAttach 1: replacing pro+one-off-prepaid with premium preserves remaining balance")}`,
	async () => {
		const customerId = "one-off-preserve-multi-attach";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro-ma", items: [proOneOff] });

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium-ma",
			items: [premiumMessages],
		});

		const { autumnV1, autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		// Burn 50 → balance 150.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// multiAttach swap to premium.
		await autumnV1.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: premium.id }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// premium grants 500; preserved 150 lifetime carryover → 650.
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 650,
			usage: 0,
		});
	},
);
