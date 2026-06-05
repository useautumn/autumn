import { expect, test } from "bun:test";
import { invoiceLineItems } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos/index.js";

test.concurrent("invoice line items: get by single customer product id", async () => {
	const lineItemId = "invoice_li_get_by_cus_prod_ids";
	const customerProductId = "cus_prod_3EfbA8teNA8ColQSwRemt4BevN9";

	await ctx.db.delete(invoiceLineItems).where(eq(invoiceLineItems.id, lineItemId));
	await ctx.db.insert(invoiceLineItems).values({
		id: lineItemId,
		amount: 100,
		amount_after_discounts: 100,
		description: "Test line item",
		direction: "charge",
		customer_product_ids: [customerProductId],
	});

	try {
		const rows = await invoiceLineItemRepo.getByCustomerProductIds({
			db: ctx.db,
			customerProductIds: [customerProductId],
		});

		expect(rows.map((row) => row.id)).toContain(lineItemId);
	} finally {
		await ctx.db.delete(invoiceLineItems).where(eq(invoiceLineItems.id, lineItemId));
	}
});
