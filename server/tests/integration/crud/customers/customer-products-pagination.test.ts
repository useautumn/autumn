import { expect, test } from "bun:test";
import { CustomerProductKind } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntil } from "@tests/utils/pollUntil.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
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

const setupCustomer = async (customerId: string) => {
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [sub1, oneOff1, oneOff2, addOn] }),
		],
		actions: [
			s.billing.attach({ productId: sub1.id, timeout: 500 }),
			s.billing.attach({ productId: oneOff1.id, timeout: 500 }),
			s.billing.attach({ productId: oneOff2.id, timeout: 500 }),
			s.billing.attach({
				productId: addOn.id,
				newBillingSubscription: true,
				timeout: 500,
			}),
		],
	});

	await pollUntil(
		async () => {
			const page = await CusService.getProductsPage({
				ctx: scenario.ctx,
				idOrInternalId: customerId,
				params: defaultParams,
			});
			return page.total_count === PRODUCT_COUNT;
		},
		{ deadlineMs: 30_000 },
	);

	return scenario;
};

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

test(`${chalk.yellowBright("customer products page: orders subscriptions, then one-off, then add-on")}`, async () => {
	const customerId = "cpp-order";
	const { ctx } = await setupCustomer(customerId);

	const page = await CusService.getProductsPage({
		ctx,
		idOrInternalId: customerId,
		params: defaultParams,
	});

	const isAddOn = (p: (typeof page.list)[number]) => p.product.is_add_on;
	const isOneOff = (p: (typeof page.list)[number]) =>
		!p.product.is_add_on &&
		(p.product.id === oneOff1.id || p.product.id === oneOff2.id);

	const ranks = page.list.map((p) => (isAddOn(p) ? 2 : isOneOff(p) ? 1 : 0));

	const sorted = [...ranks].sort((a, b) => a - b);
	expect(ranks).toEqual(sorted);
	expect(ranks[0]).toBe(0);
	expect(ranks[ranks.length - 1]).toBe(2);
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
