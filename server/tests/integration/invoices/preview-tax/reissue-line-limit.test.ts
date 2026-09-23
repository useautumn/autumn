import { expect, test } from "bun:test";
import {
	type ApiListInvoiceV1,
	type AttachParamsV1Input,
	ErrCode,
	type ReissueInvoiceParams,
	type ReissueInvoiceResponse,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

test("invoices.reissue: previews and issues 250 lines and rejects 251 before writes", async () => {
	const customerId = "reissue-line-limit";
	const pro = products.pro({ id: "reissue-line-limit", items: [] });
	const { ctx, customer, autumnV2_4 } = await initScenario({
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
			finalize: true,
			enable_plan_immediately: true,
		},
	});
	const { list } = (await autumnV2_4.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	const original = list[0];
	const stripe = ctx.stripeCli;
	const stripeCustomerId = customer!.processor!.id!;
	const beforeCustomer = await stripe.customers.retrieve(stripeCustomerId);
	if (beforeCustomer.deleted) throw new Error("Customer is deleted");
	const beforeInvoiceIds = (
		await stripe.invoices
			.list({ customer: stripeCustomerId, limit: 100 })
			.autoPagingToArray({ limit: 1000 })
	).map((invoice) => invoice.id);
	const addedLines = Array.from({ length: 250 }, (_, index) => ({
		description: `Synthetic boundary line ${index + 1}`,
		amount: 1,
	}));
	for (const preview of [true, false]) {
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "at most 250 line items",
			func: () =>
				autumnV2_4.post("/invoices.reissue", {
					invoice_id: original.id,
					preview,
					customer: { name: "Must not be saved" },
					lines: { add: addedLines },
				} satisfies ReissueInvoiceParams),
		});
	}
	const afterCustomer = await stripe.customers.retrieve(stripeCustomerId);
	if (afterCustomer.deleted) throw new Error("Customer is deleted");
	expect(afterCustomer.name).toBe(beforeCustomer.name);
	expect(
		(
			await stripe.invoices
				.list({ customer: stripeCustomerId, limit: 100 })
				.autoPagingToArray({ limit: 1000 })
		).map((invoice) => invoice.id),
	).toEqual(beforeInvoiceIds);
	expect((await stripe.invoices.retrieve(original.stripe_id)).status).toBe(
		"open",
	);
	const params = {
		invoice_id: original.id,
		lines: { add: addedLines.slice(0, 249) },
	} satisfies ReissueInvoiceParams;
	const preview = (await autumnV2_4.post("/invoices.reissue", {
		...params,
		preview: true,
	})) as ReissueInvoiceResponse;
	expect(preview.invoice).toBeNull();
	expect(preview.preview.lines).toHaveLength(250);
	expect(preview.preview.total).toBe(269);
	const issued = (await autumnV2_4.post(
		"/invoices.reissue",
		params,
	)) as ReissueInvoiceResponse;
	if (!issued.invoice) throw new Error("Reissue returned no invoice");
	expect(issued.preview.lines).toHaveLength(250);
	expect(issued.preview.total).toBe(preview.preview.total);
	expect(issued.preview.amount_due).toBe(preview.preview.amount_due);
	expect(
		(await stripe.invoices.retrieve(issued.invoice.stripe_id)).status,
	).toBe("open");
}, 180_000);
