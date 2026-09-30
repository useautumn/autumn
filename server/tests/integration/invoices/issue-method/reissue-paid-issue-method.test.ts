/**
 * invoices.reissue issue_method on a paid original.
 *
 * Contract:
 *   paid original + "draft" -> credit note as today, original stays paid,
 *                              replacement is a draft and the credit waits on the customer's balance;
 *                              the response's amount_due already counts that credit
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { payOpenInvoice } from "@tests/utils/stripeUtils/payOpenInvoice";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	attachInvoiceModePlan,
	expectIssuedAs,
	type ReissueResponse,
} from "./utils/issueMethodTestUtils";

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: paid original + draft → credit note, draft replacement, credit held on balance")}`,
	async () => {
		const customerId = "inv-issue-paid-draft";
		const pro = products.base({
			id: "pro-issue-paid-draft",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
		const original = await attachInvoiceModePlan({
			autumnV2_3,
			autumnV2_4,
			customerId,
			planId: pro.id,
			finalize: true,
		});
		await payOpenInvoice({ ctx, customerId });

		const { invoice, voided_invoice_id, credit_note_id, preview } =
			(await autumnV2_3.post("/invoices.reissue", {
				invoice_id: original.id,
				issue_method: "draft",
			})) as ReissueResponse;

		expect(voided_invoice_id).toBeNull();
		expect(credit_note_id).toBeTruthy();
		const originalStripe = await ctx.stripeCli.invoices.retrieve(
			original.stripe_id,
		);
		expect(originalStripe.status).toBe("paid");
		expect(originalStripe.metadata?.autumn_reissued_to).toBe(invoice.stripe_id);

		await expectIssuedAs({ invoice, issueMethod: "draft" });
		expect(preview.amount_due).toBe(0);

		const stripeCustomer = await ctx.stripeCli.customers.retrieve(
			originalStripe.customer as string,
		);
		if (stripeCustomer.deleted) throw new Error("customer deleted");
		expect(stripeCustomer.balance).toBe(-2000);
	},
);
