/**
 * Whether a credit balance itemizes on the invoice is stamped on the customer
 * entitlement at attach, from the plan item's price, and drives track-time
 * attribution and the balance-mutation guards from then on.
 *
 * Contract:
 *   A1 pay-per-use $0.25/credit item   → customer_entitlements.invoice_credit = true
 *   A2 included-only item, flag true   → stamp false (attach succeeds)
 *   T1 track on the stamped balance    → usage_attribution written
 *   T2 track on the unstamped balance  → plain deduction, no attribution
 *   M4 manual mutations on the unstamped balance succeed
 */

import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";

const INCLUDED = 100;

test.concurrent(
	`${chalk.yellowBright("invoice credits: the price shape at attach stamps the balance and decides attribution")}`,
	async () => {
		const pricedCustomerId = "ic-stamp-priced";
		const includedCustomerId = "ic-stamp-included";

		const priced = products.base({
			id: "ic-stamp-priced-plan",
			items: [
				items.consumable({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: INCLUDED,
					price: 0.25,
					billingUnits: 1,
				}),
			],
		});
		const includedOnly = products.base({
			id: "ic-stamp-included-plan",
			items: [
				items.free({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: INCLUDED,
				}),
			],
		});

		const { ctx, autumnV1, autumnV2_3 } = await initScenario({
			customerId: pricedCustomerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.otherCustomers([
					{ id: includedCustomerId, paymentMethod: "success" },
				]),
				s.products({ list: [priced, includedOnly] }),
			],
			actions: [
				s.attach({ productId: priced.id }),
				s.attach({
					customerId: includedCustomerId,
					productId: includedOnly.id,
				}),
			],
		});

		const creditsRow = async (customerId: string) => {
			const rows = await ctx.db
				.select()
				.from(customerEntitlements)
				.where(
					and(
						eq(customerEntitlements.customer_id, customerId),
						eq(customerEntitlements.feature_id, TestFeature.InvoiceCredits),
					),
				);
			expect(rows).toHaveLength(1);
			return rows[0];
		};

		expect((await creditsRow(pricedCustomerId)).invoice_credit).toBe(true);
		expect((await creditsRow(includedCustomerId)).invoice_credit).toBe(false);

		for (const customerId of [pricedCustomerId, includedCustomerId]) {
			await autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 50,
			});
			await expectCustomerFeatureCorrect({
				customerId,
				autumn: autumnV1,
				featureId: TestFeature.InvoiceCredits,
				balance: INCLUDED - 10,
			});
		}

		// The Redis deduction reaches Postgres on the lazy sync, like track-invoice-credit-attribution.
		await timeout(3_000);
		const stampedAttribution = (await creditsRow(pricedCustomerId))
			.usage_attribution;
		expect(Object.keys(stampedAttribution)).toHaveLength(1);
		expect(Object.values(stampedAttribution)[0]).toMatchObject({
			units: 50,
			credits: 10,
		});
		expect((await creditsRow(includedCustomerId)).usage_attribution).toEqual(
			{},
		);

		await autumnV2_3.balances.update({
			customer_id: includedCustomerId,
			feature_id: TestFeature.InvoiceCredits,
			remaining: 70,
		});
		await expectCustomerFeatureCorrect({
			customerId: includedCustomerId,
			autumn: autumnV1,
			featureId: TestFeature.InvoiceCredits,
			balance: 70,
		});
	},
);
