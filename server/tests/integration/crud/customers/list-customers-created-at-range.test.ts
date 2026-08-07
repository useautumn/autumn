/**
 * customers.list created_at_range (V2.3 cursor path):
 * - both bounds inclusive, each independently optional
 * - start > end is rejected as invalid input
 * - composes with sort_order and cursor pagination
 */

import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	type CreatedAtRange,
	ErrCode,
} from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const SEARCH = "created-at-range-lc";
const PRIMARY_CUSTOMER_ID = `${SEARCH}-a`;
const OTHER_CUSTOMER_IDS = [`${SEARCH}-b`, `${SEARCH}-c`, `${SEARCH}-d`];
const EXPECTED_CUSTOMER_COUNT = OTHER_CUSTOMER_IDS.length + 1;

type ListPage = { list: ApiCustomerV5[]; next_cursor: string | null };
type ObservedCustomer = { id: string; created_at: number };

const listPage = async ({
	autumn,
	params,
}: {
	autumn: AutumnInt;
	params: Record<string, unknown>;
}): Promise<ListPage> =>
	(await autumn.customers.listV2({
		start_cursor: "",
		limit: 50,
		search: SEARCH,
		keepInternalFields: true,
		...params,
	})) as ListPage;

const walkPages = async ({
	autumn,
	createdAtRange,
	sortOrder,
}: {
	autumn: AutumnInt;
	createdAtRange: CreatedAtRange;
	sortOrder?: "asc" | "desc";
}): Promise<string[]> => {
	const ids: string[] = [];
	let cursor = "";
	for (let page = 0; page < 10; page++) {
		const res = (await autumn.customers.listV2({
			start_cursor: cursor,
			limit: 1,
			search: SEARCH,
			created_at_range: createdAtRange,
			sort_order: sortOrder,
			keepInternalFields: true,
		})) as ListPage;
		ids.push(...res.list.map((customer) => customer.id ?? ""));
		if (!res.next_cursor) break;
		cursor = res.next_cursor;
	}
	return ids;
};

const sorted = (ids: string[]): string[] => [...ids].sort();

describe("list-customers-created-at-range", () => {
	const autumn = new AutumnInt({ version: ApiVersion.V2_3 });
	// created_at is server-assigned, so every bound below is derived from what the
	// unfiltered ascending page actually reported.
	let observed: ObservedCustomer[] = [];

	const idsInRange = ({ start, end }: CreatedAtRange): string[] =>
		observed
			.filter(
				(customer) =>
					(start === undefined || customer.created_at >= start) &&
					(end === undefined || customer.created_at <= end),
			)
			.map((customer) => customer.id);

	const listRange = async (createdAtRange: CreatedAtRange): Promise<ListPage> =>
		listPage({ autumn, params: { created_at_range: createdAtRange } });

	beforeAll(async () => {
		await initScenario({
			customerId: PRIMARY_CUSTOMER_ID,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers(OTHER_CUSTOMER_IDS.map((id) => ({ id }))),
			],
			actions: [],
		});

		const ascendingPage = await listPage({
			autumn,
			params: { sort_order: "asc" },
		});

		observed = ascendingPage.list.map((customer) => ({
			id: customer.id ?? "",
			created_at: customer.created_at,
		}));
	});

	test(`${chalk.yellowBright("list-customers-created-at-range: range between observed timestamps returns exactly that subset")}`, async () => {
		expect(observed.length).toBe(EXPECTED_CUSTOMER_COUNT);

		const start = observed[1]?.created_at ?? 0;
		const end = observed[2]?.created_at ?? 0;
		const expectedIds = idsInRange({ start, end });

		const page = await listRange({ start, end });

		expect(sorted(page.list.map((customer) => customer.id ?? ""))).toEqual(
			sorted(expectedIds),
		);
		for (const customer of page.list) {
			expect(customer.created_at).toBeGreaterThanOrEqual(start);
			expect(customer.created_at).toBeLessThanOrEqual(end);
		}
	});

	test(`${chalk.yellowBright("list-customers-created-at-range: bounds are inclusive on both ends")}`, async () => {
		const boundary = observed[0]?.created_at ?? 0;
		const expectedIds = idsInRange({ start: boundary, end: boundary });

		const [startBound, endBound, exactBound] = await Promise.all([
			listRange({ start: boundary }),
			listRange({ end: boundary }),
			listRange({ start: boundary, end: boundary }),
		]);

		const boundaryId = observed[0]?.id ?? "";
		expect(startBound.list.map((customer) => customer.id)).toContain(
			boundaryId,
		);
		expect(endBound.list.map((customer) => customer.id)).toContain(boundaryId);
		expect(
			sorted(exactBound.list.map((customer) => customer.id ?? "")),
		).toEqual(sorted(expectedIds));
	});

	test(`${chalk.yellowBright("list-customers-created-at-range: end only returns customers created at or before end")}`, async () => {
		const end = observed[1]?.created_at ?? 0;
		const expectedIds = idsInRange({ end });

		const page = await listRange({ end });

		expect(sorted(page.list.map((customer) => customer.id ?? ""))).toEqual(
			sorted(expectedIds),
		);
		for (const customer of page.list) {
			expect(customer.created_at).toBeLessThanOrEqual(end);
		}
	});

	test(`${chalk.yellowBright("list-customers-created-at-range: start only returns customers created at or after start")}`, async () => {
		const start = observed[2]?.created_at ?? 0;
		const expectedIds = idsInRange({ start });

		const page = await listRange({ start });

		expect(sorted(page.list.map((customer) => customer.id ?? ""))).toEqual(
			sorted(expectedIds),
		);
		for (const customer of page.list) {
			expect(customer.created_at).toBeGreaterThanOrEqual(start);
		}
	});

	test(`${chalk.yellowBright("list-customers-created-at-range: a range excluding every match returns an empty page with a null cursor")}`, async () => {
		const earliest = observed[0]?.created_at ?? 0;
		const latest = observed[observed.length - 1]?.created_at ?? 0;

		const [beforeAllMatches, afterAllMatches] = await Promise.all([
			listRange({ end: earliest - 1 }),
			listRange({ start: latest + 1 }),
		]);

		expect(beforeAllMatches.list).toEqual([]);
		expect(beforeAllMatches.next_cursor).toBeNull();
		expect(afterAllMatches.list).toEqual([]);
		expect(afterAllMatches.next_cursor).toBeNull();
	});

	test(`${chalk.yellowBright("list-customers-created-at-range: start after end is rejected as invalid input")}`, async () => {
		const start = observed[1]?.created_at ?? 1;
		const end = start - 1;

		// AutumnInt drops the HTTP status, and InvalidInputs is only produced by
		// the 400 request-validation path.
		const error = await listRange({ start, end }).then(
			() => null,
			(caught) => caught as { code?: string },
		);

		expect(error).not.toBeNull();
		expect(error?.code).toBe(ErrCode.InvalidInputs);
	});

	test(`${chalk.yellowBright("list-customers-created-at-range: asc and desc over the same range return the same set")}`, async () => {
		const start = observed[0]?.created_at ?? 0;
		const end = observed[observed.length - 1]?.created_at ?? 0;
		const expectedIds = idsInRange({ start, end });

		const [ascending, descending] = await Promise.all([
			listPage({
				autumn,
				params: {
					created_at_range: { start, end },
					sort_order: "asc",
				},
			}),
			listPage({
				autumn,
				params: {
					created_at_range: { start, end },
					sort_order: "desc",
				},
			}),
		]);

		const ascendingIds = ascending.list.map((customer) => customer.id ?? "");
		const descendingIds = descending.list.map((customer) => customer.id ?? "");

		expect(sorted(ascendingIds)).toEqual(sorted(expectedIds));
		expect(sorted(descendingIds)).toEqual(sorted(expectedIds));

		const ascendingTimes = ascending.list.map(
			(customer) => customer.created_at,
		);
		for (let i = 1; i < ascendingTimes.length; i++) {
			expect(ascendingTimes[i]).toBeGreaterThanOrEqual(
				ascendingTimes[i - 1] ?? 0,
			);
		}
		const descendingTimes = descending.list.map(
			(customer) => customer.created_at,
		);
		for (let i = 1; i < descendingTimes.length; i++) {
			expect(descendingTimes[i]).toBeLessThanOrEqual(
				descendingTimes[i - 1] ?? 0,
			);
		}

		// Exact reversal only holds when no two customers share a millisecond.
		const timestampsAreDistinct =
			new Set(ascendingTimes).size === ascendingTimes.length;
		if (timestampsAreDistinct) {
			expect(ascendingIds).toEqual([...descendingIds].reverse());
		}
	});

	test(`${chalk.yellowBright("list-customers-created-at-range: cursor pagination inside a range yields each match once")}`, async () => {
		const start = observed[1]?.created_at ?? 0;
		const end = observed[observed.length - 1]?.created_at ?? 0;
		const expectedIds = idsInRange({ start, end });

		const [ascendingWalk, descendingWalk] = await Promise.all([
			walkPages({
				autumn,
				createdAtRange: { start, end },
				sortOrder: "asc",
			}),
			walkPages({
				autumn,
				createdAtRange: { start, end },
				sortOrder: "desc",
			}),
		]);

		expect(new Set(ascendingWalk).size).toBe(ascendingWalk.length);
		expect(new Set(descendingWalk).size).toBe(descendingWalk.length);
		expect(sorted(ascendingWalk)).toEqual(sorted(expectedIds));
		expect(sorted(descendingWalk)).toEqual(sorted(expectedIds));
	});
});
