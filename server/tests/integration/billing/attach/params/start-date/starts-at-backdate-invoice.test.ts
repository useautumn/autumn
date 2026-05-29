/**
 * TDD test for backdated starts_at with invoice mode.
 *
 * Contract under test:
 *   New behaviors:
 *     - A paid recurring attach with invoice_mode and past starts_at creates a backdated Stripe subscription
 *     - Stripe owns the first invoice for the elapsed time and returns the hosted invoice URL when finalized
 *   Side effects:
 *     - Autumn customer_product is active, stores the past starts_at, and links to the created Stripe subscription
 */

import { expect, test } from "bun:test";
import { type AttachParamsV1Input, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectAttachBackdateCorrect } from "./expectAttachBackdateCorrect";

test.concurrent(
	`${chalk.yellowBright("starts_at backdate invoice mode: new subscription sends catch-up invoice")}`,
	async () => {
		const customerId = "attach-starts-at-backdate-invoice-mode";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

		const startsAt = advancedTo - ms.days(35);
		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: startsAt,
			invoice_mode: {
				enabled: true,
				enable_plan_immediately: true,
				finalize: true,
			},
		});

		expect(result.invoice?.status).toBe("open");
		expect(result.invoice?.hosted_invoice_url).toBeTruthy();

		await expectAttachBackdateCorrect({
			autumn: autumnV1,
			ctx,
			customerId,
			productId: pro.id,
			startsAt,
			result,
			minInvoiceTotal: 2000,
			minInvoiceLineCount: 2,
		});
	},
);
