import { expect, test } from "bun:test";
import {
	CusProductStatus,
	CustomerProductKind,
	customerProducts,
	ms,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";

const sub1 = products.pro({
	id: "cpp-sub1",
	items: [items.monthlyMessages({ includedUsage: 10 })],
});
const oneOff1 = products.oneOff({
	id: "cpp-oneoff1",
	items: [items.monthlyMessages({ includedUsage: 50 })],
});
const oneOff2 = products.oneOff({
	id: "cpp-oneoff2",
	items: [items.monthlyMessages({ includedUsage: 75 })],
});
const addOn = products.recurringAddOn({
	id: "cpp-addon",
	items: [items.monthlyMessages({ includedUsage: 30 })],
});

const PRODUCT_COUNT = 4;

const setupCustomer = async (customerId: string) =>
	initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [sub1, oneOff1, oneOff2, addOn] }),
		],
		actions: [
			s.billing.attach({ productId: sub1.id }),
			s.billing.attach({ productId: oneOff1.id }),
			s.billing.attach({ productId: oneOff2.id }),
			s.billing.attach({ productId: addOn.id, newBillingSubscription: true }),
		],
	});

const defaultParams = {
	start_cursor: "",
	limit: 10,
	show_expired: false,
};

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
			params: { start_cursor: cursor, limit: 2, show_expired: false },
		});

		expect(page.list.length).toBeLessThanOrEqual(2);
		for (const product of page.list) seen.push(product.id);

		if (!page.next_cursor) break;
		cursor = page.next_cursor;
	}

	expect(seen.length).toBe(PRODUCT_COUNT);
	expect(new Set(seen).size).toBe(PRODUCT_COUNT);
});

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
