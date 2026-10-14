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

		await ctx.db
			.update(customerEntitlements)
			.set({ expired: true })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).not.toContain(messagesEnt!.id);

		await ctx.db
			.update(customerEntitlements)
			.set({ expired: false })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).toContain(messagesEnt!.id);

		await ctx.db
			.update(customerEntitlements)
			.set({ reset_by_invoice: true })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).not.toContain(messagesEnt!.id);

		await ctx.db
			.update(customerEntitlements)
			.set({ reset_by_invoice: false })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).toContain(messagesEnt!.id);

		await ctx.db
			.update(customerEntitlements)
			.set({ expires_at: windowStart + 500 })
			.where(eq(customerEntitlements.id, messagesEnt!.id));

		ids = await fetchIdsInWindow();
		expect(ids).not.toContain(messagesEnt!.id);

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

		expect(collected).toEqual(expectedOrder);
	},
);
