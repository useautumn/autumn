import { expect, test } from "bun:test";
import { CustomerProductKind } from "@autumn/shared";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	defaultParams,
	oneOff1,
	oneOff2,
	setupCustomer,
} from "./utils/customerProductsPagination.js";

test(`${chalk.yellowBright("customer products page: kind filter narrows to one-off")}`, async () => {
	const customerId = "cpp-kind";
	const { ctx } = await setupCustomer(customerId);

	const page = await CusService.getProductsPage({
		ctx,
		idOrInternalId: customerId,
		params: {
			...defaultParams,
			kind: CustomerProductKind.OneOff,
		},
	});

	expect(page.total_count).toBe(2);
	expect(page.list.length).toBe(2);
	for (const product of page.list) {
		expect(product.product.is_add_on).toBe(false);
		expect([oneOff1.id, oneOff2.id]).toContain(product.product.id);
	}
});
