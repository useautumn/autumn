/**
 * Coverage for the offset->keyset memo on customers.list (API 2.2.0).
 *
 * Every other customers-list test pages at offset 0, and getMemoizedOffsetCursor
 * short-circuits on offset <= 0 — so none of them exercise the memo at all. This
 * one walks past offset 0 so page N+1 actually consumes the boundary page N
 * stored, which is the path that replaces OFFSET with a keyset seek.
 *
 * Contract:
 *   Behaviors:
 *     - sequential offset paging returns every customer exactly once, no skips
 *       or duplicates, with the memo engaged from page 2 onward
 *     - the full set collected across pages equals a single large page
 *     - re-walking the same offsets is stable (a warm memo returns the same page
 *       as the cold OFFSET that produced it)
 *     - a different filter at the same offset does not reuse another filter's
 *       boundary
 *   Side effects:
 *     - Redis key cusOffsetMemo:<org>:<env>:<filterHash>:<offset>, 2min TTL.
 *       Asserted directly: the memo is behaviour-preserving, so a passing walk
 *       alone would not distinguish "memo worked" from "memo never ran".
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getMemoizedOffsetCursor } from "@/internal/customers/offsetCursorMemo.js";

type OffsetPage = { list: ApiCustomerV5[] };

const PAGE = 2;
const CUSTOMER_COUNT = 7;

test.concurrent(
	`${chalk.yellowBright("list customers offset memo: sequential paging has no skips or duplicates")}`,
	async () => {
		const prefix = "list-cus-offset-memo";
		const seedCustomerId = `${prefix}-seed`;
		const product = products.base({
			id: "offset-memo-base",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: seedCustomerId,
			setup: [s.customer(), s.products({ list: [product] })],
			actions: [],
		});

		// Deterministic ids, so clear them first or a re-run collides.
		const customerIds = Array.from(
			{ length: CUSTOMER_COUNT },
			(_, index) => `${prefix}-${String(index).padStart(2, "0")}`,
		);
		for (const id of customerIds) {
			await autumnV2_2.customers.delete(id).catch(() => {});
		}
		for (const id of customerIds) {
			await autumnV2_2.customers.create({ id, name: id });
		}

		// customers.list sits under the ListCustomers rate limiter.
		const page = async (body: Record<string, unknown>) => {
			await timeout(1200);
			return (await autumnV2_2.customers.listV2({
				limit: PAGE,
				keepInternalFields: true,
				...body,
			})) as OffsetPage;
		};

		// ── Single large page: the reference set ──────────────────────────
		const wholeSet = await page({ search: prefix, limit: 50, offset: 0 });
		const wholeIds = wholeSet.list.map((customer) => customer.id);
		expect(wholeIds.length).toBeGreaterThanOrEqual(CUSTOMER_COUNT);

		// ── Sequential paging. Page 1 misses (offset 0), pages 2+ hit the memo ──
		const walk = async () => {
			const collected: (string | null)[] = [];
			for (let offset = 0; offset < wholeIds.length + PAGE; offset += PAGE) {
				const result = await page({ search: prefix, offset });
				if (result.list.length === 0) break;
				collected.push(...result.list.map((customer) => customer.id));
			}
			return collected;
		};

		const firstWalk = await walk();

		// The memo is behaviour-preserving, so a passing walk alone cannot prove it
		// engaged. Read the stored boundary the same way the handler does — without
		// this, the whole test would still pass if the memo never ran.
		const storedBoundary = await getMemoizedOffsetCursor({
			ctx: ctx as unknown as RequestContext,
			query: { search: prefix },
			offset: PAGE,
		});
		expect(storedBoundary).not.toBeNull();
		expect(typeof storedBoundary?.t).toBe("number");
		expect(typeof storedBoundary?.id).toBe("string");

		// No customer seen twice — the failure mode a stale or wrong boundary causes.
		expect(new Set(firstWalk).size).toBe(firstWalk.length);
		// No customer missed.
		expect([...firstWalk].sort()).toEqual([...wholeIds].sort());

		// ── Re-walking with a warm memo yields the same pages ─────────────
		const secondWalk = await walk();
		expect(secondWalk).toEqual(firstWalk);

		// ── A different filter must not reuse another filter's boundary ───
		// Same offset, narrower search: if the memo key ignored filters, this
		// would seek from the broad walk's boundary and return the wrong rows.
		const narrowPrefix = `${prefix}-0`;
		const narrowWhole = await page({
			search: narrowPrefix,
			limit: 50,
			offset: 0,
		});
		const narrowSecondPage = await page({ search: narrowPrefix, offset: PAGE });
		const narrowIds = narrowWhole.list.map((customer) => customer.id);
		for (const customer of narrowSecondPage.list) {
			expect(narrowIds).toContain(customer.id);
		}
	},
);
