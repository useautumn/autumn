/** Multi-attach replaces multiple product groups atomically; this was previously rejected. */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	chalk.yellowBright("multi-attach: replaces multiple product groups"),
	async () => {
		const existingA = products.base({
			id: "existing-a",
			items: [items.monthlyPrice({ price: 5 })],
		});
		const existingB = products.base({
			id: "existing-b",
			items: [items.monthlyPrice({ price: 10 })],
			group: "group-b",
		});
		const replacementA = products.base({
			id: "replacement-a",
			items: [items.monthlyPrice({ price: 15 })],
		});
		const replacementB = products.base({
			id: "replacement-b",
			items: [items.monthlyPrice({ price: 20 })],
			group: "group-b",
		});

		const { autumnV1, autumnV2_2, customerId } = await initScenario({
			customerId: "ma-multiple-transitions",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [existingA, existingB, replacementA, replacementB],
				}),
			],
			actions: [
				s.billing.attach({ productId: existingA.id }),
				s.billing.attach({ productId: existingB.id }),
			],
		});

		const params = {
			customer_id: customerId,
			plans: [{ plan_id: replacementA.id }, { plan_id: replacementB.id }],
		};
		const preview = await autumnV2_2.billing.previewMultiAttach(params);
		expect(preview.total).toBeCloseTo(20);
		expect(
			preview.outgoing
				.map((change: { plan_id: string }) => change.plan_id)
				.sort(),
		).toEqual([existingA.id, existingB.id].sort());
		const noProrationPreview = await autumnV2_2.billing.previewMultiAttach({
			...params,
			billing_behavior: "none",
		});
		expect(noProrationPreview.total).toBe(0);

		await autumnV2_2.billing.multiAttach({
			...params,
			billing_behavior: "none",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [replacementA.id, replacementB.id],
			notPresent: [existingA.id, existingB.id],
		});
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 10,
		});
	},
);
