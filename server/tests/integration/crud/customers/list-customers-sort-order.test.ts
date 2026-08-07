/**
 * customers.list sort_order (V2.3 cursor path):
 * - omitted / "desc" → newest first (existing behavior)
 * - "asc" → oldest first, exact reverse of desc
 * - cursor pagination walks forward correctly in both directions
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, ApiVersion } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const SEARCH = "sort-order-lc";

type ListPage = { list: ApiCustomerV5[]; next_cursor: string | null };

const listPage = async (
	autumn: AutumnInt,
	params: Record<string, unknown>,
): Promise<ListPage> =>
	(await autumn.customers.listV2({
		start_cursor: "",
		limit: 50,
		search: SEARCH,
		keepInternalFields: true,
		...params,
	})) as ListPage;

const walkPages = async (
	autumn: AutumnInt,
	sortOrder: "asc" | "desc",
): Promise<string[]> => {
	const ids: string[] = [];
	let cursor = "";
	for (let page = 0; page < 10; page++) {
		const res = (await autumn.customers.listV2({
			start_cursor: cursor,
			limit: 1,
			search: SEARCH,
			sort_order: sortOrder,
			keepInternalFields: true,
		})) as ListPage;
		ids.push(...res.list.map((customer) => customer.id ?? ""));
		if (!res.next_cursor) break;
		cursor = res.next_cursor;
	}
	return ids;
};

test.concurrent(
	`${chalk.yellowBright("list-customers-sort-order: asc reverses desc and cursor walks match")}`,
	async () => {
		await initScenario({
			customerId: `${SEARCH}-a`,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: `${SEARCH}-b` }, { id: `${SEARCH}-c` }]),
			],
			actions: [],
		});

		const autumn = new AutumnInt({ version: ApiVersion.V2_3 });

		const [defaultPage, descPage, ascPage] = await Promise.all([
			listPage(autumn, {}),
			listPage(autumn, { sort_order: "desc" }),
			listPage(autumn, { sort_order: "asc" }),
		]);

		expect(defaultPage.list.length).toBe(3);
		expect(descPage.list.length).toBe(3);
		expect(ascPage.list.length).toBe(3);

		const defaultIds = defaultPage.list.map((customer) => customer.id ?? "");
		const descIds = descPage.list.map((customer) => customer.id ?? "");
		const ascIds = ascPage.list.map((customer) => customer.id ?? "");

		expect(defaultIds).toEqual(descIds);
		expect(ascIds).toEqual([...descIds].reverse());

		const ascTimes = ascPage.list.map((customer) => customer.created_at);
		for (let i = 1; i < ascTimes.length; i++) {
			expect(ascTimes[i]!).toBeGreaterThanOrEqual(ascTimes[i - 1]!);
		}
		const descTimes = descPage.list.map((customer) => customer.created_at);
		for (let i = 1; i < descTimes.length; i++) {
			expect(descTimes[i]!).toBeLessThanOrEqual(descTimes[i - 1]!);
		}

		const [ascWalk, descWalk] = await Promise.all([
			walkPages(autumn, "asc"),
			walkPages(autumn, "desc"),
		]);
		expect(ascWalk).toEqual(ascIds);
		expect(descWalk).toEqual(descIds);
	},
);

test.concurrent(
	`${chalk.yellowBright("list-customers-sort-order: invalid sort_order rejected")}`,
	async () => {
		const autumn = new AutumnInt({ version: ApiVersion.V2_3 });

		await expect(
			autumn.customers.listV2({
				start_cursor: "",
				limit: 1,
				sort_order: "newest" as unknown as "asc",
			}),
		).rejects.toThrow();
	},
);
