/**
 * TDD tests for the V2 reset scan page query
 * (customerEntitlementsRepo.getResetEligibleCustomerEntitlementsPage).
 *
 * Contract under test:
 *   Behaviors:
 *     - includes rows with next_reset_at < dueBefore
 *     - excludes rows with next_reset_at >= dueBefore
 *     - excludes rows with expired = true; includes expired = null AND
 *       expired = false (sticky manual false)
 *     - excludes rows with reset_by_invoice = true (invoice.created owns
 *       their reset); includes null AND false
 *     - excludes loose-expiry rows with expires_at <= dueBefore; includes
 *       expires_at > dueBefore
 *     - orders by (next_reset_at, id COLLATE "C"), id as tiebreak
 *     - keyset pagination: pages are disjoint, complete, and respect limit
 *
 * Isolation strategy: each test plants its rows at UNIQUE ancient
 * next_reset_at values (1970s-1980s) and scans with a dueBefore just above
 * its own window — rows from other tests/suites (which use ~now timestamps)
 * can never enter the window, so exact-membership assertions are safe.
 */

import { expect, test } from "bun:test";
import { customerEntitlements, ms } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { getResetEligibleCustomerEntitlementsPage } from "@/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage.js";

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 scan: eligibility filters (overdue, expired, expires_at)")}`,
	async () => {
		const customerId = "batch-reset-v2-scan-eligibility";
		// Unique ancient window for this test only.
		const windowStart = Date.UTC(1975, 0, 1);
		const dueBefore = windowStart + ms.days(1);

		const plan = products.base({
			id: "scan-eligibility",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyCredits({ includedUsage: 100 }),
			],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		const messagesEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const creditsEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		expect(messagesEnt).toBeDefined();
		expect(creditsEnt).toBeDefined();

		const fetchIdsInWindow = async () => {
			const page = await getResetEligibleCustomerEntitlementsPage({
				db: ctx.db,
				dueBefore,
				cursor: null,
				limit: 1000,
			});
			return page.map((row) => row.id);
		};

		// ── Overdue row is included; future row is not ──────────────────
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: windowStart + 1000 })
			.where(eq(customerEntitlements.id, messagesEnt!.id));
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: dueBefore + ms.days(365) })
			.where(eq(customerEntitlements.id, creditsEnt!.id));

		let ids = await fetchIdsInWindow();
		expect(ids).toContain(messagesEnt!.id);
		expect(ids).not.toContain(creditsEnt!.id);

		// ── expired = true is excluded ──────────────────────────────────
		await ctx.db
			.update(customerEntitlements)
			.set({ expired: true })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).not.toContain(messagesEnt!.id);

		// ── expired = false (sticky manual false) is included ───────────
		await ctx.db
			.update(customerEntitlements)
			.set({ expired: false })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).toContain(messagesEnt!.id);

		// ── reset_by_invoice = true is excluded ─────────────────────────
		await ctx.db
			.update(customerEntitlements)
			.set({ reset_by_invoice: true })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).not.toContain(messagesEnt!.id);

		// ── reset_by_invoice = false is included ────────────────────────
		await ctx.db
			.update(customerEntitlements)
			.set({ reset_by_invoice: false })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).toContain(messagesEnt!.id);

		// ── expires_at in the past is excluded ──────────────────────────
		await ctx.db
			.update(customerEntitlements)
			.set({ expires_at: windowStart + 500 })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).not.toContain(messagesEnt!.id);

		// ── expires_at in the future is included ────────────────────────
		await ctx.db
			.update(customerEntitlements)
			.set({ expires_at: dueBefore + ms.days(365) })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).toContain(messagesEnt!.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 scan: keyset pagination is ordered, disjoint and complete")}`,
	async () => {
		const customerId = "batch-reset-v2-scan-pagination";
		const otherCustomerId = "batch-reset-v2-scan-pagination-b";
		// Unique ancient window for this test only. Must be the LOWEST window
		// in this file: a scan at dueBefore includes everything older, so the
		// strict toEqual below only holds if no other test plants rows below
		// this window.
		const windowStart = Date.UTC(1971, 0, 1);
		const dueBefore = windowStart + ms.days(1);

		const plan = products.base({
			id: "scan-pagination",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyCredits({ includedUsage: 100 }),
			],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: otherCustomerId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({ productId: plan.id }),
				s.attach({ productId: plan.id, customerId: otherCustomerId }),
			],
		});

		const rows = [
			await findCustomerEntitlement({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			}),
			await findCustomerEntitlement({
				ctx,
				customerId,
				featureId: TestFeature.Credits,
			}),
			await findCustomerEntitlement({
				ctx,
				customerId: otherCustomerId,
				featureId: TestFeature.Messages,
			}),
			await findCustomerEntitlement({
				ctx,
				customerId: otherCustomerId,
				featureId: TestFeature.Credits,
			}),
		];
		for (const row of rows) expect(row).toBeDefined();

		// Two rows share the same next_reset_at to exercise the id tiebreak.
		const plantedResetAts = [
			windowStart + 1000,
			windowStart + 2000,
			windowStart + 2000,
			windowStart + 3000,
		];
		for (let i = 0; i < rows.length; i++) {
			await ctx.db
				.update(customerEntitlements)
				.set({ next_reset_at: plantedResetAts[i] })
				.where(eq(customerEntitlements.id, rows[i]!.id));
		}

		const expectedOrder = rows
			.map((row, i) => ({ id: row!.id, nextResetAt: plantedResetAts[i] }))
			.sort((a, b) => a.nextResetAt - b.nextResetAt || (a.id < b.id ? -1 : 1))
			.map((row) => row.id);

		// ── Page size is respected; pages are disjoint and complete ─────
		const collected: string[] = [];
		let cursor: { nextResetAt: number; id: string } | null = null;
		let pages = 0;
		while (true) {
			const page = await getResetEligibleCustomerEntitlementsPage({
				db: ctx.db,
				dueBefore,
				cursor,
				limit: 2,
			});
			pages++;
			expect(page.length).toBeLessThanOrEqual(2);
			if (page.length === 0) break;
			collected.push(...page.map((row) => row.id));
			const lastRow = page[page.length - 1];
			cursor = { nextResetAt: lastRow.nextResetAt, id: lastRow.id };
			if (page.length < 2) break;
			expect(pages).toBeLessThan(10);
		}

		// ── Exactly our 4 rows, in (next_reset_at, id) order, no dupes ──
		expect(collected).toEqual(expectedOrder);
	},
);
