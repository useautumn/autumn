/**
 * invoices.issue_credit_note: credit an open or paid Stripe invoice.
 *
 * Contract:
 *   POST /invoices.issue_credit_note { invoice_id, amount | lines, destination?, ... } -> { credit_note }
 *   paid + lines + refund  → refund issued, refunded_amount tracked on our row
 *   paid + amount          → defaults to customer_balance
 *   open + amount          → reduces what's owed; preview creates nothing
 *   both amount+lines / foreign line → 400
 */

import { expect, test } from "bun:test";
import type { ApiCreditNote, ApiListInvoiceV1 } from "@autumn/shared";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type CreditNoteResponse = { credit_note: ApiCreditNote };
type Autumn = Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];

const getOnlyInvoice = async ({
	autumnV2_3,
	customerId,
}: {
	autumnV2_3: Autumn;
	customerId: string;
}) => {
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	expect(list).toHaveLength(1);
	return list[0];
};

const setupPaidInvoice = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		id: `pro-${customerId}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const invoice = await getOnlyInvoice({ autumnV2_3, customerId });
	expect(invoice.status).toBe("paid");
	return { autumnV2_3, invoice };
};

test.concurrent(
	`${chalk.yellowBright("invoices.issue_credit_note: paid invoice, line refund → refund issued and tracked")}`,
	async () => {
		const customerId = "credit-note-paid-refund";
		const { autumnV2_3, invoice } = await setupPaidInvoice({ customerId });
		const line = invoice.items?.find((item) => item.amount > 0);
		expect(line).toBeDefined();

		const request = {
			invoice_id: invoice.id,
			lines: [{ id: line!.id, amount: 5 }],
			destination: "refund",
			send_email: false,
			reason: "product_unsatisfactory",
			memo: "Partial refund",
		};

		const { credit_note: preview } = (await autumnV2_3.post(
			"/invoices.issue_credit_note",
			{ ...request, preview: true },
		)) as CreditNoteResponse;
		expect(preview.id).toBeNull();
		expect(preview.refund_amount).toBe(5);

		const { credit_note: creditNote } = (await autumnV2_3.post(
			"/invoices.issue_credit_note",
			request,
		)) as CreditNoteResponse;
		expect(creditNote.id).toStartWith("cn_");
		expect(creditNote.invoice_id).toBe(invoice.id);
		expect(creditNote.total).toBe(5);
		expect(creditNote.post_payment_amount).toBe(5);
		expect(creditNote.refund_amount).toBe(5);
		expect(creditNote.credit_amount).toBe(0);
		expect(creditNote.reason).toBe("product_unsatisfactory");
		expect(creditNote.memo).toBe("Partial refund");
		expect(creditNote.lines[0]?.invoice_line_item_id).toBe(line!.id);

		const stripeCreditNote = await ctx.stripeCli.creditNotes.retrieve(
			creditNote.id!,
		);
		expect(stripeCreditNote.refunds.length).toBe(1);

		const refreshed = await getOnlyInvoice({ autumnV2_3, customerId });
		expect(refreshed.refunded_amount).toBe(5);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.issue_credit_note: paid invoice, flat amount → customer balance by default")}`,
	async () => {
		const customerId = "credit-note-paid-balance";
		const { autumnV2_3, invoice } = await setupPaidInvoice({ customerId });

		const { credit_note: creditNote } = (await autumnV2_3.post(
			"/invoices.issue_credit_note",
			{ invoice_id: invoice.id, amount: 3, send_email: false },
		)) as CreditNoteResponse;
		expect(creditNote.total).toBe(3);
		expect(creditNote.credit_amount).toBe(3);
		expect(creditNote.refund_amount).toBe(0);

		const stripeCreditNote = await ctx.stripeCli.creditNotes.retrieve(
			creditNote.id!,
		);
		expect(stripeCreditNote.customer_balance_transaction).toBeTruthy();

		const refreshed = await getOnlyInvoice({ autumnV2_3, customerId });
		expect(refreshed.refunded_amount).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.issue_credit_note: open invoice → reduces amount due; preview creates nothing")}`,
	async () => {
		const customerId = "credit-note-open";
		const pro = products.pro({
			id: "pro-credit-note-open",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: true,
				}),
			],
		});
		const invoice = await getOnlyInvoice({ autumnV2_3, customerId });
		expect(invoice.status).toBe("open");

		const request = {
			invoice_id: invoice.id,
			amount: 4,
			destination: "refund",
			send_email: false,
		};
		await autumnV2_3.post("/invoices.issue_credit_note", {
			...request,
			preview: true,
		});
		const before = await ctx.stripeCli.creditNotes.list({
			invoice: invoice.stripe_id,
		});
		expect(before.data).toHaveLength(0);

		const { credit_note: creditNote } = (await autumnV2_3.post(
			"/invoices.issue_credit_note",
			request,
		)) as CreditNoteResponse;
		expect(creditNote.pre_payment_amount).toBe(4);
		expect(creditNote.post_payment_amount).toBe(0);
		expect(creditNote.refund_amount).toBe(0);

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		expect(stripeInvoice.amount_remaining).toBe(
			Math.round((invoice.total - 4) * 100),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.issue_credit_note: invalid requests → 400")}`,
	async () => {
		const customerId = "credit-note-invalid";
		const { autumnV2_3, invoice } = await setupPaidInvoice({ customerId });
		const line = invoice.items?.[0];

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.post("/invoices.issue_credit_note", {
					invoice_id: invoice.id,
					amount: 1,
					lines: [{ id: line!.id, amount: 1 }],
				}),
		});
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_3.post("/invoices.issue_credit_note", {
					invoice_id: invoice.id,
					lines: [{ id: "invoice_li_not_on_invoice", amount: 1 }],
				}),
		});
	},
);
