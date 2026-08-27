/**
 * Attach-level miss cases for custom fixed Stripe reuse.
 *
 * Query-level EUR / interval / other product.id coverage lives in
 * find-newest-reusable-fixed-price.test.ts (#5). These prove the
 * attach path also misses when Stripe is dead or the shape diverges.
 *
 * Contract:
 *   borrowed Stripe inactive → B mints a new id
 *   monthly $40 vs yearly $40 → different ids
 *   Pro $40 must not take Premium $40
 */

import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	customerFixedStripePriceId,
	expectDistinctFixedStripePrices,
} from "./utils/customerFixedStripePriceId";

test.concurrent(
	`${chalk.yellowBright("reuse custom fixed: dead borrowed Stripe → B mints a new Price")}`,
	async () => {
		const customerBId = "reuse-edge-b-dead";
		const pro = products.pro({ id: "reuse-edge-ab-dead", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-edge-a-dead",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: customerBId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 25 }) },
		});

		const a = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});
		if (!a.customerStripePriceId) {
			throw new Error("expected A to mint a Stripe Price");
		}
		await ctx.stripeCli.prices.update(a.customerStripePriceId, {
			active: false,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerBId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 25 }) },
		});

		await expectDistinctFixedStripePrices({
			ctx,
			leftCustomerId: customerId,
			rightCustomerId: customerBId,
			leftCatalogProductId: pro.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse custom fixed: monthly $40 vs yearly $40 mint different Prices")}`,
	async () => {
		const customerBId = "reuse-edge-b-interval";
		const pro = products.pro({ id: "reuse-edge-ab-interval", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-edge-a-interval",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: customerBId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.annualPrice({ amount: 40 }) },
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerBId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 40 }) },
		});

		await expectDistinctFixedStripePrices({
			ctx,
			leftCustomerId: customerId,
			rightCustomerId: customerBId,
			leftCatalogProductId: pro.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse custom fixed: Pro $40 must not take Premium $40")}`,
	async () => {
		const customerBId = "reuse-edge-b-plan";
		const pro = products.pro({ id: "reuse-edge-pro", items: [] });
		const premium = products.premium({ id: "reuse-edge-prem", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-edge-a-plan",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.otherCustomers([{ id: customerBId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 40 }) },
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerBId,
			plan_id: premium.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 40 }) },
		});

		await expectDistinctFixedStripePrices({
			ctx,
			leftCustomerId: customerId,
			rightCustomerId: customerBId,
			leftCatalogProductId: pro.id,
			rightCatalogProductId: premium.id,
		});
	},
);
