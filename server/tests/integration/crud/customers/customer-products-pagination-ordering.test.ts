import { expect, test } from "bun:test";
import { CusProductStatus, customerProducts, ms } from "@autumn/shared";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import {
	addOn,
	defaultParams,
	oneOff1,
	oneOff2,
	setupCustomer,
} from "./utils/customerProductsPagination.js";

test(`${chalk.yellowBright("customer products page: orders active plans and add-ons before one-off")}`, async () => {
	const customerId = "cpp-order";
	const { ctx } = await setupCustomer(customerId);

	const page = await CusService.getProductsPage({
		ctx,
		idOrInternalId: customerId,
		params: defaultParams,
	});

	const isOneOff = (p: (typeof page.list)[number]) =>
		p.product.id === oneOff1.id || p.product.id === oneOff2.id;

	const ranks = page.list.map((p) => (isOneOff(p) ? 1 : 0));

	const sorted = [...ranks].sort((a, b) => a - b);
	expect(ranks).toEqual(sorted);

	const addOnIndex = page.list.findIndex((p) => p.product.id === addOn.id);
	const firstOneOffIndex = page.list.findIndex(isOneOff);
	expect(addOnIndex).toBeLessThan(firstOneOffIndex);
});

test(`${chalk.yellowBright("customer products page: scheduled plans follow active ones, earliest start first")}`, async () => {
	const customerId = "cpp-scheduled";
	const { ctx } = await setupCustomer(customerId);

	const rows = await ctx.db
		.select({ id: customerProducts.id, productId: customerProducts.product_id })
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.customer_id, customerId),
				inArray(customerProducts.product_id, [oneOff1.id, oneOff2.id]),
			),
		);

	const idFor = (productId: string) => {
		const row = rows.find((r) => r.productId === productId);
		if (!row) throw new Error(`Expected a customer product for ${productId}`);
		return row.id;
	};

	// oneOff2 was attached last, so created_at DESC alone would surface it first.
	const now = Date.now();
	await ctx.db
		.update(customerProducts)
		.set({ status: CusProductStatus.Scheduled, starts_at: now + ms.days(1) })
		.where(eq(customerProducts.id, idFor(oneOff1.id)));
	await ctx.db
		.update(customerProducts)
		.set({ status: CusProductStatus.Scheduled, starts_at: now + ms.days(30) })
		.where(eq(customerProducts.id, idFor(oneOff2.id)));

	const page = await CusService.getProductsPage({
		ctx,
		idOrInternalId: customerId,
		params: defaultParams,
	});

	const scheduledIndexes = page.list
		.map((p, index) => ({ p, index }))
		.filter(({ p }) => p.status === CusProductStatus.Scheduled)
		.map(({ index }) => index);
	const activeIndexes = page.list
		.map((p, index) => ({ p, index }))
		.filter(({ p }) => p.status === CusProductStatus.Active)
		.map(({ index }) => index);

	expect(Math.max(...activeIndexes)).toBeLessThan(
		Math.min(...scheduledIndexes),
	);

	const scheduledProductIds = scheduledIndexes.map(
		(index) => page.list[index].product.id,
	);
	expect(scheduledProductIds).toEqual([oneOff1.id, oneOff2.id]);
});
