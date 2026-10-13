import { expect, test } from "bun:test";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	defaultParams,
	PRODUCT_COUNT,
	setupCustomer,
} from "./utils/customerProductsPagination.js";

test(`${chalk.yellowBright("customer products page: returns all with total_count and no next_cursor")}`, async () => {
	const customerId = "cpp-all";
	const { ctx } = await setupCustomer(customerId);

	const page = await CusService.getProductsPage({
		ctx,
		idOrInternalId: customerId,
		params: defaultParams,
	});

	expect(page.total_count).toBe(PRODUCT_COUNT);
	expect(page.list.length).toBe(PRODUCT_COUNT);
	expect(page.next_cursor).toBeNull();
});

test(`${chalk.yellowBright("customer products page: cursor paginates without overlap and covers all")}`, async () => {
	const customerId = "cpp-cursor";
	const { ctx } = await setupCustomer(customerId);

	const seen: string[] = [];
	let cursor = "";
	let guard = 0;

	while (guard < PRODUCT_COUNT + 2) {
		guard++;
		const page = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params: { start_cursor: cursor, limit: 2, status: "active" },
		});

		expect(page.list.length).toBeLessThanOrEqual(2);
		for (const product of page.list) seen.push(product.id);

		if (!page.next_cursor) break;
		cursor = page.next_cursor;
	}

	expect(seen.length).toBe(PRODUCT_COUNT);
	expect(new Set(seen).size).toBe(PRODUCT_COUNT);
});
