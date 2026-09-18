/**
 * invoices.reissue on a paid invoice: correct it with a credit note instead of a void.
 *
 * Contract:
 *   paid invoice, no credit_original      -> 400 (a paid invoice is never voided by accident)
 *   paid invoice + credit_original: true  -> original stays paid, a credit note refunds it to
 *                                            the customer's balance, and the corrected
 *                                            replacement is issued for the new amount
 *   the replacement never carries the original's deferred-plan pointer, so paying it
 *   cannot promote a plan a second time
 */

import { expect, test } from "bun:test";
import type { ApiListInvoiceV1, AttachParamsV1Input } from "@autumn/shared";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { payOpenInvoice } from "@tests/utils/stripeUtils/payOpenInvoice";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type Scenario = Awaited<ReturnType<typeof initScenario>>;
type ReissueResponse = {
	invoice: ApiListInvoiceV1;
	voided_invoice_id: string | null;
	credit_note_id: string | null;
};

const paidSendInvoice = async ({
	autumnV2_3,
	autumnV2_4,
	customerId,
	planId,
	taxRateId,
}: {
	autumnV2_3: Scenario["autumnV2_3"];
	autumnV2_4: Scenario["autumnV2_4"];
	customerId: string;
	planId: string;
	taxRateId?: string;
}) => {
	await autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		...(taxRateId ? { tax_rate_id: taxRateId } : {}),
		invoice_mode: { enabled: true, finalize: true, net_terms_days: 7 },
	});
	await payOpenInvoice({ ctx, customerId });

	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	return list[0];
};

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: paid invoice without credit_original → 400")}`,
	async () => {
		const customerId = "inv-reissue-paid-guard";
		const pro = products.base({
			id: "pro-reissue-paid-guard",
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

		const original = await paidSendInvoice({
			autumnV2_3,
			autumnV2_4,
			customerId,
			planId: pro.id,
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "credit_original",
			func: () =>
				autumnV2_3.post("/invoices.reissue", { invoice_id: original.id }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: paid invoice + credit_original → credit note, original stays paid")}`,
	async () => {
		const customerId = "inv-reissue-paid-credit";
		const pro = products.base({
			id: "pro-reissue-paid-credit",
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

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "US Tax",
			percentage: 10,
			inclusive: false,
		});
		const original = await paidSendInvoice({
			autumnV2_3,
			autumnV2_4,
			customerId,
			planId: pro.id,
			taxRateId: taxRate.id,
		});
		expect(original.total).toBe(22);
		expect(
			(await ctx.stripeCli.invoices.retrieve(original.stripe_id)).status,
		).toBe("paid");

		const { invoice, voided_invoice_id, credit_note_id } =
			(await autumnV2_3.post("/invoices.reissue", {
				invoice_id: original.id,
				credit_original: true,
				invoice: {
					tax_rate_id: null,
					custom_fields: [{ name: "PO number", value: "PO-9001" }],
				},
			})) as ReissueResponse;

		expect(voided_invoice_id).toBeNull();
		expect(credit_note_id).toBeTruthy();

		const originalStripe = await ctx.stripeCli.invoices.retrieve(
			original.stripe_id,
		);
		expect(originalStripe.status).toBe("paid");
		expect(originalStripe.metadata?.autumn_reissued_to).toBe(invoice.stripe_id);

		const creditNote = await ctx.stripeCli.creditNotes.retrieve(
			credit_note_id ?? "",
		);
		expect(creditNote.invoice).toBe(original.stripe_id);
		expect(creditNote.total).toBe(2200);

		// The customer holds the $22 back as balance, so the corrected $20 is covered.
		const replacement = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		expect(replacement.total).toBe(2000);
		// The $22 credit covers the corrected $20 in full, so nothing is owed again.
		expect(replacement.starting_balance).toBe(-2200);
		expect(replacement.amount_due).toBe(0);
		expect(replacement.custom_fields).toEqual([
			{ name: "PO number", value: "PO-9001" },
		]);
		expect(replacement.metadata?.autumn_reissued_from).toBe(original.stripe_id);
		// Paying the replacement must not promote a plan the original already did.
		expect(replacement.metadata?.autumn_metadata_id).toBeUndefined();
	},
);
