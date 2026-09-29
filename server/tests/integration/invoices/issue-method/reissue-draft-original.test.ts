/**
 * invoices.reissue on a draft original. Stripe cannot void a draft, and refuses to
 * delete a subscription one, so the original is finalized silently and then voided.
 *
 * Contract:
 *   draft original             -> original ends void, finalized with auto_advance off,
 *                                 flagged autumn_skip_finalized_webhook so no org webhook fires
 *                              -> the pending plan's pointer moves to the replacement
 *   customer credit balance    -> the throwaway finalize consumes it, the void returns it
 *   issue_method honored       -> replacement is sent (default) or left as a draft
 */

import { expect, test } from "bun:test";
import { ALL_STATUSES, CusProductStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";
import {
	attachInvoiceModePlan,
	expectIssuedAs,
	type ReissueResponse,
} from "./utils/issueMethodTestUtils";

const expectOriginalDiscarded = async ({
	stripeInvoiceId,
	replacementStripeId,
}: {
	stripeInvoiceId: string;
	replacementStripeId: string;
}) => {
	const original = await ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
	expect(original.status).toBe("void");
	expect(original.auto_advance).toBe(false);
	expect(original.metadata?.autumn_skip_finalized_webhook).toBe("true");
	expect(original.metadata?.autumn_reissued_to).toBe(replacementStripeId);
	return original;
};

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: draft original → silently finalized then voided, pending plan moves to the sent replacement")}`,
	async () => {
		const customerId = `inv-issue-draft-original-${Date.now()}`;
		const pro = products.pro({
			id: "pro-issue-draft-original",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, autumnV2_4, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});
		const original = await attachInvoiceModePlan({
			autumnV2_3,
			autumnV2_4,
			customerId,
			planId: pro.id,
			finalize: false,
		});
		expect(original.status).toBe("draft");

		const pending = (
			await CusProductService.list({
				db: ctx.db,
				internalCustomerId: customer?.internal_id ?? "",
				inStatuses: ALL_STATUSES,
			})
		).find((customerProduct) => customerProduct.product.id === pro.id);
		expect(pending?.status).toBe(CusProductStatus.Pending);

		const { invoice, voided_invoice_id } = (await autumnV2_3.post(
			"/invoices.reissue",
			{ invoice_id: original.id },
		)) as ReissueResponse;

		expect(voided_invoice_id).toBe(original.id);
		await expectOriginalDiscarded({
			stripeInvoiceId: original.stripe_id,
			replacementStripeId: invoice.stripe_id,
		});
		await expectIssuedAs({ invoice, issueMethod: "send" });

		const metadata = await MetadataService.get({
			db: ctx.db,
			id: pending?.metadata_id ?? "",
		});
		expect(metadata?.stripe_invoice_id).toBe(invoice.stripe_id);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: draft original + draft → credit balance survives the throwaway finalize")}`,
	async () => {
		const customerId = "inv-issue-draft-original-credit";
		const pro = products.base({
			id: "pro-issue-draft-original-credit",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});
		const original = await attachInvoiceModePlan({
			autumnV2_3,
			autumnV2_4,
			customerId,
			planId: pro.id,
			finalize: false,
		});
		const draft = await ctx.stripeCli.invoices.retrieve(original.stripe_id);
		const stripeCustomerId = draft.customer as string;
		await ctx.stripeCli.customers.createBalanceTransaction(stripeCustomerId, {
			amount: -3000,
			currency: draft.currency,
		});

		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			issue_method: "draft",
		})) as ReissueResponse;

		const discarded = await expectOriginalDiscarded({
			stripeInvoiceId: original.stripe_id,
			replacementStripeId: invoice.stripe_id,
		});
		// Proves the finalize really applied the credit before the void returned it.
		expect(discarded.starting_balance).toBe(-3000);
		await expectIssuedAs({ invoice, issueMethod: "draft" });

		const stripeCustomer =
			await ctx.stripeCli.customers.retrieve(stripeCustomerId);
		if (stripeCustomer.deleted) throw new Error("customer deleted");
		expect(stripeCustomer.balance).toBe(-3000);
	},
);
