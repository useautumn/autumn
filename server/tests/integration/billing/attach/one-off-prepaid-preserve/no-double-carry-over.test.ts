/**
 * TDD test for double carry-over on one-off prepaid cusEnts.
 *
 * Bug:
 *   One-off prepaid cusEnts are now ALWAYS auto-preserved as a lifetime
 *   cusEnt via cusProductToOneOffPrepaidCarryOvers (no opt-in needed).
 *   When the caller ALSO passes `carry_over_balances: { enabled: true }`,
 *   the existing-balance carry-over helper iterates the same one-off
 *   prepaid cusEnt and mints a second carry-over row — doubling the
 *   preserved balance.
 *
 * Red-failure mode (pre-fix):
 *   Upgrade pro(one-off-prepaid 200, 50 used → 150) → premium(500 monthly)
 *   with carry_over_balances enabled yields balance 800 (= 500 + 150 + 150)
 *   instead of the expected 650 (= 500 + 150).
 *
 * Green (post-fix):
 *   cusProductToExistingBalanceCarryOvers skips cusEnts already handled by
 *   the dedicated one-off prepaid path, so total balance = 650.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("no-double-carry-over: one-off prepaid + carry_over_balances on same feature only carries balance once")}`,
	async () => {
		const customerId = "no-double-carry-over-one-off-prepaid";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro-ndco", items: [proOneOff] });

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium-ndco",
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

		// Burn 50 of 200 → one-off cusEnt balance = 150.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Upgrade WITH carry_over_balances on messages — the dedicated one-off
		// prepaid path will also mint a carry-over, so the existing-balance
		// path must NOT mint a second row for the same cusEnt.
		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_balances: {
				enabled: true,
				feature_ids: [TestFeature.Messages],
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// 500 premium + 150 preserved one-off = 650. Pre-fix: 800 (double-counted).
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 650,
			usage: 0,
		});
	},
);
