/**
 * Invoice plan_ids must keep a hard-deleted plan from the snapshot when
 * its sibling still resolves live. Partial array_agg is not complete.
 *
 * Red (current):  resolved_product_ids is [A]; processInvoice treats a
 *                 nonempty array as complete and drops snapshot B.
 * Green (after):  resolver merges live A + snapshot B, so fetch returns both.
 */

import { test } from "bun:test";
import { type ApiCustomerV5, CustomerExpand } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products as productFixtures } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectInvoicePlanIdsCorrect } from "./utils/expectInvoicePlanIdsCorrect.js";

test.concurrent(
	`${chalk.yellowBright("invoices resolve: hard-deleted plan stays on invoice via snapshot")}`,
	async () => {
		const customerId = "inv-partial-del";
		const stripeId = `in_partial_del_${Date.now()}`;
		const pro = productFixtures.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = productFixtures.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		await autumnV2_3.post("/invoices.insert", {
			invoices: [
				{
					customer_id: customerId,
					plan_ids: [pro.id, premium.id],
					stripe_id: stripeId,
					processor_type: "stripe",
					status: "paid",
					total: 70,
					created_at: Date.UTC(2016, 0, 1),
				},
			],
		});

		await autumnV2_3.catalogV2.update({
			remove_plans: [{ plan_id: premium.id }],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			expand: [CustomerExpand.Invoices],
			skip_cache: "true",
		});

		expectInvoicePlanIdsCorrect({
			invoices: customer.invoices ?? [],
			stripeId,
			planIds: [pro.id, premium.id],
		});
	},
);
