/**
 * Integration test for the migration `$none` plan quantifier, end-to-end.
 *
 * Contract under test (raw filter is parsed through CustomerFilterSchema first —
 * that parse layer is where the quantifier was previously stripped to `{}`):
 *   Behaviors:
 *     - parse({ plan: { $none: {} } })                       -> customers with NO active plan only
 *     - parse({ plan: {} })  (implicit $some)                -> customers with ANY active plan (complement)
 *     - parse({ plan: { $none: { plan_id: { $in: [X] } } }}) -> empty-inclusive "not on X":
 *                                                               no-plan customers + customers on other plans,
 *                                                               excluding plan X
 *   Side effects: none (read-only filter).
 *
 * Regression: before the arrayFilter union fix, CustomerFilterSchema.parse
 * dropped `$none` -> `{}` (implicit $some), so `$none` matched "has any plan".
 * That makes assertion 1 below count the complement instead of the no-plan set.
 */

import { test, expect } from "bun:test";
import chalk from "chalk";
import { CustomerFilterSchema } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import {
	countCustomers,
	filterCustomers,
	type CustomerRow,
} from "@/internal/migrations/v2/filters/customers/filterCustomers.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

async function collectIds(
	gen: AsyncGenerator<CustomerRow[]>,
): Promise<Set<string>> {
	const ids = new Set<string>();
	for await (const batch of gen) {
		for (const row of batch) if (row.id) ids.add(row.id);
	}
	return ids;
}

test.concurrent(
	`${chalk.yellowBright("migration filter $none: selects customers with no active plan")}`,
	async () => {
		// Unique per-run prefix so `search` scopes the shared org down to just
		// these three customers (counts stay deterministic under concurrency).
		const pfx = `none-flt-${Math.random().toString(36).slice(2, 8)}`;
		const onX = `${pfx}-onx`;
		const noPlan = `${pfx}-non`;
		const onY = `${pfx}-ony`;

		const planX = products.base({
			id: `${pfx}-px`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planY = products.base({
			id: `${pfx}-py`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId: onX,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: noPlan }, { id: onY }]),
				s.products({ list: [planX, planY] }),
			],
			actions: [
				s.billing.attach({ productId: planX.id }),
				s.billing.attach({ productId: planY.id, customerId: onY }),
				// `noPlan` intentionally attaches nothing.
			],
		});

		const noneEmpty = CustomerFilterSchema.parse({ plan: { $none: {} } });
		const hasAny = CustomerFilterSchema.parse({ plan: {} });
		const notOnX = CustomerFilterSchema.parse({
			plan: { $none: { plan_id: { $in: [planX.id] } } },
		});

		// ── Assertion 1: $none empty -> only the no-plan customer ───────────────
		expect(await countCustomers({ ctx, filter: noneEmpty, search: pfx })).toBe(
			1,
		);
		const noneIds = await collectIds(
			filterCustomers({ ctx, filter: noneEmpty, search: pfx }),
		);
		expect(noneIds.has(noPlan)).toBe(true);
		expect(noneIds.has(onX)).toBe(false);
		expect(noneIds.has(onY)).toBe(false);

		// ── Assertion 2: implicit $some (complement) -> the plan-bearing customers
		expect(await countCustomers({ ctx, filter: hasAny, search: pfx })).toBe(2);
		const anyIds = await collectIds(
			filterCustomers({ ctx, filter: hasAny, search: pfx }),
		);
		expect(anyIds.has(onX)).toBe(true);
		expect(anyIds.has(onY)).toBe(true);
		expect(anyIds.has(noPlan)).toBe(false);

		// ── Assertion 3: $none with inner plan_id -> empty-inclusive "not on X" ──
		expect(await countCustomers({ ctx, filter: notOnX, search: pfx })).toBe(2);
		const notOnXIds = await collectIds(
			filterCustomers({ ctx, filter: notOnX, search: pfx }),
		);
		expect(notOnXIds.has(noPlan)).toBe(true);
		expect(notOnXIds.has(onY)).toBe(true);
		expect(notOnXIds.has(onX)).toBe(false);
	},
);
