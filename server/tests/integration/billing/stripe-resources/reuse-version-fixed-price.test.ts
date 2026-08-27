/**
 * Customize attach of Pro v2 to v1's fixed amount should reuse v1's Stripe Price.
 *
 * Mintlify repro: Pro v1 $1000 exists; customize Pro v2 to $1000 minted
 * price_1Ty753 instead of v1's price_1Ty6wG.
 *
 * Red (current):  customer stripe_price_id !== v1 catalog stripe_price_id
 * Green (after):  customer stripe_price_id === v1 catalog stripe_price_id
 */

import { expect, test } from "bun:test";
import { type AttachParamsV1Input, BillingInterval } from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	catalogVersionFixedStripePriceId,
	customerFixedStripePriceId,
} from "./utils/customerFixedStripePriceId";

test.concurrent(
	`${chalk.yellowBright("reuse version fixed: customize v2 to v1 amount ($20) reuses v1 Stripe Price")}`,
	async () => {
		const pro = products.pro({ id: "reuse-ver-diverge-pro", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-ver-diverge",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: pro.id,
					versioning: "new_version",
					active: true,
					price: { amount: 30, interval: BillingInterval.Month },
				},
			],
		});

		const v1StripePriceId = await catalogVersionFixedStripePriceId({
			ctx,
			catalogProductId: pro.id,
			version: 1,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 20 }) },
		});

		const attached = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});

		expect(v1StripePriceId).toBeTruthy();
		expect(attached.customerStripePriceId).toBe(v1StripePriceId);
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse version fixed: customize v2 when v2 catalog is also $20 reuses v1 Stripe Price")}`,
	async () => {
		const pro = products.pro({ id: "reuse-ver-same-pro", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-ver-same",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: pro.id,
					versioning: "new_version",
					active: true,
					price: { amount: 20, interval: BillingInterval.Month },
				},
			],
		});

		const v1StripePriceId = await catalogVersionFixedStripePriceId({
			ctx,
			catalogProductId: pro.id,
			version: 1,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 20 }) },
		});

		const attached = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});

		expect(v1StripePriceId).toBeTruthy();
		expect(attached.customerStripePriceId).toBe(v1StripePriceId);
	},
);
