/**
 * Invoice credit on previews: the server decides how much of the customer's
 * Stripe credit balance an invoice consumes, and what is left to pay.
 *
 * Contract:
 *   invoices.create preview -> invoice_credits { balance, applied }, amount_due = total - applied
 *   credit above the total  -> applied capped at the total, amount_due 0
 *   no credit               -> applied 0, amount_due = total
 *   billing.attach preview  -> invoice_credits.applied, with total already net
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	CreateInvoiceResponse,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";

const PRO_BASE = 20;

const stripeCustomerIdOf = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const stripeCustomerId = customer?.processor?.id;
	if (!stripeCustomerId)
		throw new Error(`No Stripe customer for ${customerId}`);
	return stripeCustomerId;
};

const grantStripeCredit = async ({
	stripeCli,
	stripeCustomerId,
	amount,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
	amount: number;
}) =>
	stripeCli.customers.createBalanceTransaction(stripeCustomerId, {
		amount: -amount,
		currency: "usd",
	});

test(`${chalk.yellowBright("invoice credits: create preview nets the customer's credit off the total")}`, async () => {
	const customerId = "inv-credit-create";
	const pro = products.pro({ id: "pro-credit-create", items: [] });
	const { ctx, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const noCredit = (await autumnV2_3.post("/invoices.create", {
		customer_id: customerId,
		preview: true,
		plans: [{ plan_id: pro.id }],
	})) as CreateInvoiceResponse;

	expect(noCredit.preview.total).toEqual(PRO_BASE);
	expect(noCredit.preview.amount_due).toEqual(PRO_BASE);
	expect(noCredit.preview.invoice_credits?.applied).toEqual(0);

	const stripeCustomerId = await stripeCustomerIdOf({ ctx, customerId });
	await grantStripeCredit({
		stripeCli: ctx.stripeCli,
		stripeCustomerId,
		amount: 500,
	});

	const partial = (await autumnV2_3.post("/invoices.create", {
		customer_id: customerId,
		preview: true,
		plans: [{ plan_id: pro.id }],
	})) as CreateInvoiceResponse;

	// $5 of credit against a $20 invoice: all of it applies, $15 left to pay.
	expect(partial.preview.invoice_credits).toMatchObject({
		balance: 5,
		applied: 5,
		currency: "usd",
	});
	expect(partial.preview.total).toEqual(PRO_BASE);
	expect(partial.preview.amount_due).toEqual(15);

	await grantStripeCredit({
		stripeCli: ctx.stripeCli,
		stripeCustomerId,
		amount: 5000,
	});

	const covered = (await autumnV2_3.post("/invoices.create", {
		customer_id: customerId,
		preview: true,
		plans: [{ plan_id: pro.id }],
	})) as CreateInvoiceResponse;

	// $55 of credit against a $20 invoice: only $20 applies, nothing is due.
	expect(covered.preview.invoice_credits).toMatchObject({
		balance: 55,
		applied: PRO_BASE,
	});
	expect(covered.preview.amount_due).toEqual(0);
});

test(`${chalk.yellowBright("invoice credits: attach preview reports the same applied amount and amount due")}`, async () => {
	const customerId = "inv-credit-attach";
	const pro = products.pro({ id: "pro-credit-attach", items: [] });
	const { ctx, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await grantStripeCredit({
		stripeCli: ctx.stripeCli,
		stripeCustomerId: await stripeCustomerIdOf({ ctx, customerId }),
		amount: 1200,
	});

	const preview = await autumnV2_3.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
	});

	// Attach previews report a total that already nets the credit off, so
	// `applied` is what explains the gap from pro's $20 base.
	expect(preview.invoice_credits).toMatchObject({ balance: 12, applied: 12 });
	expect(preview.total).toEqual(8);
});
