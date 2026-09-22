/**
 * invoices.reissue preview: what the replacement would look like, without
 * voiding the original or issuing anything.
 *
 * Contract:
 *   preview: true -> { invoice: null, voided_invoice_id: null, preview }
 *   preview lines mirror the original's lines and total
 *   the original stays open and no replacement is created
 *   a customer's Stripe credit balance shows as applied against the total
 */

import { expect, test } from "bun:test";
import type {
	ApiListInvoiceV1,
	AttachParamsV1Input,
	CreateInvoicePreview,
	ReissueInvoiceResponse,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const PRO_BASE = 20;

const firstInvoice = async ({
	autumnV2_3,
	customerId,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
}) => {
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	return list[0];
};

test(`${chalk.yellowBright("invoices.reissue preview: returns the replacement's lines and leaves the original open")}`, async () => {
	const customerId = "inv-reissue-preview";
	const pro = products.pro({
		id: "pro-reissue-preview",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, autumnV2_4 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		invoice_mode: {
			enabled: true,
			enable_plan_immediately: true,
			finalize: true,
		},
	});
	const original = await firstInvoice({ autumnV2_3, customerId });

	const response = (await autumnV2_3.post("/invoices.reissue", {
		invoice_id: original.id,
		preview: true,
	})) as ReissueInvoiceResponse;

	expect(response.invoice).toBeNull();
	expect(response.voided_invoice_id).toBeNull();
	expect(response.preview.total).toEqual(PRO_BASE);
	expect(response.preview.amount_due).toEqual(PRO_BASE);
	expect(response.preview.lines.map((line) => line.amount)).toEqual([PRO_BASE]);
	expect(response.preview.lines[0].plan_id).toBe(pro.id);

	// Nothing was issued and nothing was voided.
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	expect(list.length).toBe(1);
	expect(list[0].id).toBe(original.id);
	expect(list[0].status).toBe("open");

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		original.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");
	expect(stripeInvoice.metadata?.autumn_reissued_to).toBeUndefined();
});

test(`${chalk.yellowBright("invoices.reissue preview: credit on the customer shows as applied against the total")}`, async () => {
	const customerId = "inv-reissue-preview-credit";
	const pro = products.pro({ id: "pro-reissue-preview-credit", items: [] });
	const { autumnV2_3, autumnV2_4 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		invoice_mode: {
			enabled: true,
			enable_plan_immediately: true,
			finalize: true,
		},
	});
	const original = await firstInvoice({ autumnV2_3, customerId });

	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	await ctx.stripeCli.customers.createBalanceTransaction(
		customer?.processor?.id ?? "",
		{ amount: -800, currency: "usd" },
	);

	const response = (await autumnV2_3.post("/invoices.reissue", {
		invoice_id: original.id,
		preview: true,
	})) as ReissueInvoiceResponse;

	// $8 of credit against pro's $20 invoice leaves $12 to pay.
	expect(response.preview.invoice_credits).toMatchObject({
		balance: 8,
		applied: 8,
	});
	expect(response.preview.total).toEqual(PRO_BASE);
	expect(response.preview.amount_due).toEqual(12);
});

test.concurrent(
	`${chalk.yellowBright("invoices.reissue preview: reflects line edits without issuing anything")}`,
	async () => {
		const customerId = "inv-reissue-preview-adjusted";
		const pro = products.base({
			id: "pro-reissue-preview-adj",
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

		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: {
				enabled: true,
				finalize: true,
				enable_plan_immediately: true,
			},
		});
		const { list } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as { list: ApiListInvoiceV1[] };
		const original = list[0];
		const baseLine = original.items?.[0];
		if (!baseLine) throw new Error("original invoice has no line items");

		const { invoice, preview } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: original.id,
			preview: true,
			lines: {
				update: [{ id: baseLine.id, amount: 15 }],
				add: [{ description: "Onboarding", amount: 100 }],
			},
		})) as { invoice: ApiListInvoiceV1 | null; preview: CreateInvoicePreview };

		expect(invoice).toBeNull();
		expect(preview.total).toBe(115);
		expect(
			preview.lines.map((line) => line.amount).sort((a, b) => a - b),
		).toEqual([15, 100]);

		// Nothing was issued: the original is still the only invoice and still open.
		const { list: after } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as { list: ApiListInvoiceV1[] };
		expect(after.map((row) => row.id)).toEqual([original.id]);
		expect(after[0].status).toBe("open");
	},
);
