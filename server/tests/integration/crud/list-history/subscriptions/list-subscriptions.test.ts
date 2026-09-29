/**
 * subscriptions.list — recurring customer_products in API shape, live or expired.
 *
 * Contract:
 *   POST /v1/subscriptions.list { customer_id?, entity_id?, statuses?[], plan_id?, limit, start_cursor }
 *     -> { list: SubscriptionListRow[], has_more, next_cursor }
 *   - statuses omitted → active + scheduled; ["expired"] → expired only; values combine
 *   - statuses ["past_due"] matches DB past_due, row reads status "active", past_due true
 *   - one-off purchases are excluded; add-ons are included
 *   - rows ordered newest first per customer; cursor walks without overlap
 *   - org-wide (no customer_id) walks customers; a page may be short while has_more is true
 *
 * Red (before): the route does not exist.
 * Green (after): every assertion below holds.
 */

import { expect, test } from "bun:test";
import { CusProductStatus, type SubscriptionListRow } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { listSubscriptions, walkAllPages } from "../utils/listHistoryClient.js";
import { setPlanStatus } from "../utils/setPlanStatus.js";

const planIds = (rows: SubscriptionListRow[]) => rows.map((row) => row.plan_id);

test.concurrent(
	`${chalk.yellowBright("subscriptions.list: statuses filter — default, expired only, past_due, combined")}`,
	async () => {
		const pro = products.pro({
			id: "lh-sub-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "lh-sub-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const addOn = products.recurringAddOn({
			id: "lh-sub-addon",
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const oneOff = products.oneOff({
			id: "lh-sub-oneoff",
			items: [items.oneOffWords({ billingUnits: 100, price: 10 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "lh-sub-statuses",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, addOn, oneOff] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: addOn.id, newBillingSubscription: true }),
				s.billing.attach({
					productId: oneOff.id,
					options: [{ feature_id: TestFeature.Words, quantity: 100 }],
				}),
			],
		});

		await setPlanStatus({
			ctx,
			customerId,
			productId: addOn.id,
			status: CusProductStatus.PastDue,
		});

		// Default: live recurring plans only, newest first; pro (expired) and the one-off are absent
		const live = await listSubscriptions({
			autumn: autumnV2_4,
			params: { customer_id: customerId },
		});
		expect(planIds(live.list)).toEqual([addOn.id, premium.id]);
		expect(live.has_more).toBe(false);
		expect(live.next_cursor).toBeNull();
		for (const row of live.list) {
			expect(row.status).toBe("active");
			expect(row.customer_id).toBe(customerId);
			expect(row.entity_id).toBeNull();
			expect(typeof row.id).toBe("string");
			expect(typeof row.created_at).toBe("number");
		}
		expect(live.list.find((row) => row.plan_id === addOn.id)?.past_due).toBe(
			true,
		);
		expect(live.list.find((row) => row.plan_id === premium.id)?.past_due).toBe(
			false,
		);

		// Expired only
		const expired = await listSubscriptions({
			autumn: autumnV2_4,
			params: { customer_id: customerId, statuses: ["expired"] },
		});
		expect(planIds(expired.list)).toEqual([pro.id]);
		expect(expired.list[0].status).toBe("expired");

		// past_due filters on DB state but reads as active + past_due
		const pastDue = await listSubscriptions({
			autumn: autumnV2_4,
			params: { customer_id: customerId, statuses: ["past_due"] },
		});
		expect(planIds(pastDue.list)).toEqual([addOn.id]);
		expect(pastDue.list[0].status).toBe("active");
		expect(pastDue.list[0].past_due).toBe(true);

		// Combined
		const combined = await listSubscriptions({
			autumn: autumnV2_4,
			params: { customer_id: customerId, statuses: ["active", "expired"] },
		});
		expect(planIds(combined.list)).toEqual([addOn.id, premium.id, pro.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("subscriptions.list: cursor walks one customer's expired plans without overlap")}`,
	async () => {
		const pro = products.pro({
			id: "lh-walk-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "lh-walk-premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const growth = products.growth({
			id: "lh-walk-growth",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});
		const ultra = products.ultra({
			id: "lh-walk-ultra",
			items: [items.monthlyMessages({ includedUsage: 400 })],
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "lh-sub-walk",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, growth, ultra] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: growth.id }),
				s.billing.attach({ productId: ultra.id }),
			],
		});

		const pages = await walkAllPages({
			fetchPage: (startCursor) =>
				listSubscriptions({
					autumn: autumnV2_4,
					params: {
						customer_id: customerId,
						statuses: ["expired"],
						limit: 1,
						start_cursor: startCursor,
					},
				}),
		});

		expect(pages.map((page) => page.has_more)).toEqual([true, true, false]);
		expect(pages.flatMap((page) => planIds(page.list))).toEqual([
			growth.id,
			premium.id,
			pro.id,
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("subscriptions.list: org-wide walk, plan_id walk, and short pages under the scan cap")}`,
	async () => {
		const free = products.base({
			id: "lh-org-free",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "lh-org-main",
			setup: [
				s.platform.create({
					userEmail: "lh-org-main@autumn.test",
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: false }),
				s.otherCustomers([
					{ id: "lh-org-a" },
					{ id: "lh-org-b" },
					{ id: "lh-org-live" },
				]),
				s.products({ list: [free] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.billing.attach({ productId: free.id, customerId: "lh-org-a" }),
				s.billing.attach({ productId: free.id, customerId: "lh-org-b" }),
				s.billing.attach({ productId: free.id, customerId: "lh-org-live" }),
			],
		});

		const expiredCustomers = [customerId, "lh-org-a", "lh-org-b"];
		for (const id of expiredCustomers) {
			await setPlanStatus({
				ctx,
				customerId: id,
				productId: free.id,
				status: CusProductStatus.Expired,
			});
		}

		const customersOf = (pages: { list: SubscriptionListRow[] }[]) =>
			pages.flatMap((page) => page.list.map((row) => row.customer_id)).sort();

		// Org-wide customer walk
		const orgPages = await walkAllPages({
			fetchPage: (startCursor) =>
				listSubscriptions({
					autumn: autumnV2_4,
					params: {
						statuses: ["expired"],
						limit: 1,
						start_cursor: startCursor,
					},
				}),
		});
		expect(customersOf(orgPages)).toEqual([...expiredCustomers].sort());

		// Plan walk
		const planPages = await walkAllPages({
			fetchPage: (startCursor) =>
				listSubscriptions({
					autumn: autumnV2_4,
					params: {
						plan_id: free.id,
						statuses: ["expired"],
						limit: 2,
						start_cursor: startCursor,
					},
				}),
		});
		expect(customersOf(planPages)).toEqual([...expiredCustomers].sort());

		// Scan cap of 1 customer per page: pages come back short (even empty) while has_more is true
		const cappedPages = await walkAllPages({
			fetchPage: (startCursor) =>
				listSubscriptions({
					autumn: autumnV2_4,
					params: {
						statuses: ["expired"],
						limit: 5,
						start_cursor: startCursor,
					},
					options: { scanCap: 1 },
				}),
		});
		expect(cappedPages.every((page) => page.list.length <= 1)).toBe(true);
		expect(
			cappedPages.some((page) => page.list.length === 0 && page.has_more),
		).toBe(true);
		expect(customersOf(cappedPages)).toEqual([...expiredCustomers].sort());
	},
);
