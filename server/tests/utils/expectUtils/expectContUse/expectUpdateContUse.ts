import type { ProductItem, ProductV2 } from "@autumn/shared";
import { expect } from "chai";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export const attachNewContUseAndExpectCorrect = async ({
	autumn,
	customerId,
	product,
	customItems,
	numInvoices,
}: {
	autumn: AutumnInt;
	customerId: string;
	product: ProductV2;
	customItems: ProductItem[];

	numInvoices: number;
}) => {
	const preview = await autumn.attachPreview({
		customer_id: customerId,
		product_id: product.id,
		is_custom: true,
		items: customItems,
	});

	await autumn.attach({
		customer_id: customerId,
		product_id: product.id,
		is_custom: true,
		items: customItems,
	});

	const customer = await autumn.customers.get(customerId);
	const invoices = customer.invoices;
	expect(invoices.length).to.equal(numInvoices);
	expect(invoices[0].total).to.equal(preview.due_today.total);
	return { customer, invoices };
};
