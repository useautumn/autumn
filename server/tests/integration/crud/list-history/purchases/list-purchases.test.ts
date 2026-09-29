/**
 * purchases.list — one-off customer_products in API shape, live or expired.
 *
 * Contract:
 *   POST /v1/purchases.list { customer_id?, entity_id?, statuses?[], plan_id?, limit, start_cursor }
 *     -> { list: PurchaseListRow[], has_more, next_cursor }
 *   - one-off plans only; recurring plans and add-ons are excluded
 *   - statuses omitted → live only; ["expired"] → expired only
 *
 * Red (before): the route does not exist.
 * Green (after): every assertion below holds.
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { listPurchases } from "../utils/listHistoryClient.js";
import { setPlanStatus } from "../utils/setPlanStatus.js";

test.concurrent(
	`${chalk.yellowBright("purchases.list: one-off packs only, expired vs live")}`,
	async () => {
		const pro = products.pro({
			id: "lh-pur-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const packA = products.oneOff({
			id: "lh-pur-pack-a",
			items: [items.oneOffWords({ billingUnits: 100, price: 10 })],
		});
		const packB = products.oneOffAddOn({
			id: "lh-pur-pack-b",
			items: [items.oneOffStorage({ billingUnits: 100, price: 10 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "lh-pur-packs",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, packA, packB] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: packA.id,
					options: [{ feature_id: TestFeature.Words, quantity: 100 }],
				}),
				s.billing.attach({
					productId: packB.id,
					options: [{ feature_id: TestFeature.Storage, quantity: 100 }],
				}),
			],
		});

		await setPlanStatus({
			ctx,
			customerId,
			productId: packA.id,
			status: CusProductStatus.Expired,
		});

		const live = await listPurchases({
			autumn: autumnV2_4,
			params: { customer_id: customerId },
		});
		expect(live.list.map((row) => row.plan_id)).toEqual([packB.id]);
		expect(live.list[0].status).toBe("active");
		expect(live.list[0].customer_id).toBe(customerId);
		expect(live.list[0].quantity).toBe(1);

		const expired = await listPurchases({
			autumn: autumnV2_4,
			params: { customer_id: customerId, statuses: ["expired"] },
		});
		expect(expired.list.map((row) => row.plan_id)).toEqual([packA.id]);
		expect(expired.list[0].status).toBe("expired");
		expect(expired.has_more).toBe(false);
	},
);
