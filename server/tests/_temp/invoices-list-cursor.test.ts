/**
 * TDD test for POST /v1/invoices.list — cursor-paginated invoice listing.
 *
 * Contract under test:
 *   New types/fields:
 *     - ListInvoicesParams: { start_cursor, limit, customer_id?, entity_id?,
 *       status?: ("draft"|"open"|"paid"|"void"|"uncollectible")[],
 *       processor_types?: ("stripe"|"revenuecat")[] }
 *     - ApiListInvoiceV1: ApiInvoiceV1 + { id, customer_id, entity_id (nullable),
 *       amount_paid (nullable), refunded_amount }
 *   New endpoints:
 *     - POST /v1/invoices.list -> { list: ApiListInvoiceV1[], next_cursor: string | null }
 *   New behaviors:
 *     - Org-scoped, ordered (created_at DESC, id DESC), StandardCursor pagination
 *     - customer_id filter scopes to one customer
 *     - entity_id filter requires customer_id (400 without it)
 *     - status[] filter over raw DB statuses
 *     - processor_types[] filter; NULL processor_type rows count as "stripe"
 *     - 20 preseeded invoices, limit 10 -> page1: 10 + cursor, page2: 10 + null cursor
 *       (exact boundary), zero overlap
 *     - 20 preseeded invoices, limit 50 -> all 20 in one page, next_cursor null
 *   Side effects: none (read-only endpoint)
 *
 * Pre-impl red: every assertion fails because the /v1/invoices.list route does not exist.
 * Post-impl green: all assertions pass once handler + InvoiceService.getCursorPage ship.
 */

import { expect, test } from "bun:test";
import { entities, invoices } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";

const SEED_COUNT = 20;
const OPEN_COUNT = 4;
const VOID_COUNT = 2;
const UNCOLLECTIBLE_COUNT = 1;
const DRAFT_COUNT = 1;
const REVENUECAT_COUNT = 2;
const ENTITY_INVOICE_COUNT = 5;

// i=0 is newest. Statuses: 0-11 paid, 12-15 open, 16-17 void, 18 uncollectible, 19 draft.
const statusForIndex = (i: number): string => {
	if (i < 12) return "paid";
	if (i < 16) return "open";
	if (i < 18) return "void";
	if (i < 19) return "uncollectible";
	return "draft";
};

// Processor: 0-1 revenuecat, 2 legacy NULL (counts as stripe), rest stripe.
const processorForIndex = (i: number): string | null => {
	if (i < REVENUECAT_COUNT) return "revenuecat";
	if (i === REVENUECAT_COUNT) return null;
	return "stripe";
};

test.concurrent(
	`${chalk.yellowBright("invoices.list: cursor pagination + customer/entity/status/processor filters")}`,
	async () => {
		const customerId = "invoices-list-cursor";
		const runTag = `${Date.now()}`;

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const customerRow = await ctx.db.query.customers.findFirst({
			where: (c, { and: andOp, eq: eqOp }) =>
				andOp(
					eqOp(c.org_id, ctx.org.id),
					eqOp(c.env, ctx.env),
					eqOp(c.id, customerId),
				),
		});
		expect(customerRow).toBeDefined();
		const internalCustomerId = customerRow!.internal_id;

		const entityRow = await ctx.db.query.entities.findFirst({
			where: and(
				eq(entities.internal_customer_id, internalCustomerId),
				eq(entities.id, "ent-1"),
			),
		});
		expect(entityRow).toBeDefined();

		// ── Preseed 20 invoices directly in the DB ─────────────────────────
		const base = Date.now();
		const seedIds: string[] = [];
		const seedRows = Array.from({ length: SEED_COUNT }, (_, i) => {
			const id = `inv_templc_${runTag}_${String(i).padStart(2, "0")}`;
			seedIds.push(id);
			return {
				id,
				created_at: base - i * 1000,
				internal_customer_id: internalCustomerId,
				internal_entity_id:
					i < ENTITY_INVOICE_COUNT ? entityRow!.internal_id : null,
				stripe_id: `in_templc_${runTag}_${i}`,
				processor_type: processorForIndex(i),
				status: statusForIndex(i),
				total: i + 1,
				amount_paid: i === 3 ? null : i + 1,
				refunded_amount: 0,
				currency: "usd",
				product_ids: ["pro"],
				internal_product_ids: [],
			};
		});
		await ctx.db.insert(invoices).values(seedRows);

		// ── Contract assertion 1: limit 50 → all 20 in one page, null cursor ──
		const fullPage = await autumnV2_2.post("/invoices.list", {
			customer_id: customerId,
			limit: 50,
		});
		expect(fullPage.list).toHaveLength(SEED_COUNT);
		expect(fullPage.next_cursor).toBeNull();

		// ── Contract assertion 2: ordering (created_at DESC, id DESC) ──
		expect(fullPage.list.map((inv: any) => inv.id)).toEqual(seedIds);

		// ── Contract assertion 3: item shape (ApiListInvoiceV1) ──
		const first = fullPage.list[0];
		expect(first.id).toBe(seedIds[0]);
		expect(first.customer_id).toBe(customerId);
		expect(first.entity_id).toBe("ent-1");
		expect(first.plan_ids).toEqual(["pro"]);
		expect(first.stripe_id).toBe(`in_templc_${runTag}_0`);
		expect(first.processor_type).toBe("revenuecat");
		expect(first.status).toBe("paid");
		expect(first.total).toBe(1);
		expect(first.amount_paid).toBe(1);
		expect(first.refunded_amount).toBe(0);
		expect(first.currency).toBe("usd");
		expect(first.created_at).toBe(base);

		const nonEntityInvoice = fullPage.list[ENTITY_INVOICE_COUNT];
		expect(nonEntityInvoice.entity_id).toBeNull();

		const nullAmountPaid = fullPage.list[3];
		expect(nullAmountPaid.amount_paid).toBeNull();

		// ── Contract assertion 4: exact-boundary pagination, limit 10 ──
		const page1 = await autumnV2_2.post("/invoices.list", {
			customer_id: customerId,
			limit: 10,
		});
		expect(page1.list).toHaveLength(10);
		expect(page1.next_cursor).not.toBeNull();
		expect(typeof page1.next_cursor).toBe("string");
		expect(page1.list.map((inv: any) => inv.id)).toEqual(seedIds.slice(0, 10));

		const page2 = await autumnV2_2.post("/invoices.list", {
			customer_id: customerId,
			limit: 10,
			start_cursor: page1.next_cursor,
		});
		expect(page2.list).toHaveLength(10);
		expect(page2.list.map((inv: any) => inv.id)).toEqual(seedIds.slice(10, 20));
		// Exact boundary: 20 rows consumed by 2 pages of 10 → no third page.
		expect(page2.next_cursor).toBeNull();

		const page1Ids = new Set(page1.list.map((inv: any) => inv.id));
		for (const inv of page2.list) {
			expect(page1Ids.has(inv.id)).toBe(false);
		}

		// ── Contract assertion 5: status filter ──
		const openOnly = await autumnV2_2.post("/invoices.list", {
			customer_id: customerId,
			status: ["open"],
		});
		expect(openOnly.list).toHaveLength(OPEN_COUNT);
		for (const inv of openOnly.list) {
			expect(inv.status).toBe("open");
		}

		const openAndVoid = await autumnV2_2.post("/invoices.list", {
			customer_id: customerId,
			status: ["open", "void"],
		});
		expect(openAndVoid.list).toHaveLength(OPEN_COUNT + VOID_COUNT);

		const terminalMinor = await autumnV2_2.post("/invoices.list", {
			customer_id: customerId,
			status: ["uncollectible", "draft"],
		});
		expect(terminalMinor.list).toHaveLength(UNCOLLECTIBLE_COUNT + DRAFT_COUNT);

		// ── Contract assertion 6: processor_types filter (NULL counts as stripe) ──
		const revenuecatOnly = await autumnV2_2.post("/invoices.list", {
			customer_id: customerId,
			processor_types: ["revenuecat"],
		});
		expect(revenuecatOnly.list).toHaveLength(REVENUECAT_COUNT);
		for (const inv of revenuecatOnly.list) {
			expect(inv.processor_type).toBe("revenuecat");
		}

		const stripeOnly = await autumnV2_2.post("/invoices.list", {
			customer_id: customerId,
			processor_types: ["stripe"],
		});
		expect(stripeOnly.list).toHaveLength(SEED_COUNT - REVENUECAT_COUNT);
		for (const inv of stripeOnly.list) {
			expect(inv.processor_type).toBe("stripe");
		}

		// ── Contract assertion 7: entity_id filter (with customer_id) ──
		const entityScoped = await autumnV2_2.post("/invoices.list", {
			customer_id: customerId,
			entity_id: "ent-1",
		});
		expect(entityScoped.list).toHaveLength(ENTITY_INVOICE_COUNT);
		for (const inv of entityScoped.list) {
			expect(inv.entity_id).toBe("ent-1");
		}

		// ── Contract assertion 8: entity_id without customer_id → 400 ──
		expect(
			autumnV2_2.post("/invoices.list", { entity_id: "ent-1" }),
		).rejects.toThrow();

		// ── Contract assertion 9: unfiltered call succeeds (org-scoped) ──
		// Org is shared with concurrent suites, so only assert shape + presence.
		const unfiltered = await autumnV2_2.post("/invoices.list", { limit: 50 });
		expect(Array.isArray(unfiltered.list)).toBe(true);
		expect(unfiltered.list.length).toBeGreaterThan(0);
		for (const inv of unfiltered.list) {
			// customer_id is null only for customers created without an ID.
			expect(
				inv.customer_id === null || typeof inv.customer_id === "string",
			).toBe(true);
		}
	},
);
