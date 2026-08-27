/**
 * Customize A then B: same diverging usage price shares one Stripe Price.
 *
 * Catalog reuse already ran. This path fires when the attach-currency
 * slot is still empty (catalog $1/msg → customize $2/msg).
 *
 * Contract:
 *   A $2 then B $2 consumable → same stripe_price_id + product + meter, not catalog
 *   A $2 then B $3 → different stripe_price_ids
 *   A allocated-v2 $20 then B $20 → same stripe_price_id + product, not catalog
 */

import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	customerUsageStripePriceId,
	expectSharedUsageStripeMeter,
	expectSharedUsageStripePrice,
	expectSharedUsageStripeProduct,
} from "./utils/customerUsageStripePriceId";

test.concurrent(
	`${chalk.yellowBright("reuse custom usage: A $2 then B $2 share one Stripe Price")}`,
	async () => {
		const customerBId = "reuse-usage-b-same";
		const pro = products.pro({
			id: "reuse-usage-ab-same",
			items: [items.consumableMessages({ price: 1 })],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-usage-a-same",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: customerBId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		const customize2: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { items: [itemsV2.consumableMessages({ amount: 2 })] },
		};

		await autumnV2_3.billing.attach<AttachParamsV1Input>(customize2);
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			...customize2,
			customer_id: customerBId,
		});

		await expectSharedUsageStripePrice({
			ctx,
			customerIds: [customerId, customerBId],
			catalogProductId: pro.id,
			featureId: TestFeature.Messages,
		});
		await expectSharedUsageStripeMeter({
			ctx,
			customerIds: [customerId, customerBId],
			catalogProductId: pro.id,
			featureId: TestFeature.Messages,
		});
		await expectSharedUsageStripeProduct({
			ctx,
			customerIds: [customerId, customerBId],
			catalogProductId: pro.id,
			featureId: TestFeature.Messages,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse custom usage: A $2 then B $3 mint different Stripe Prices")}`,
	async () => {
		const customerBId = "reuse-usage-b-diverge";
		const pro = products.pro({
			id: "reuse-usage-ab-diverge",
			items: [items.consumableMessages({ price: 1 })],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-usage-a-diverge",
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
			customize: { items: [itemsV2.consumableMessages({ amount: 2 })] },
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerBId,
			plan_id: pro.id,
			customize: { items: [itemsV2.consumableMessages({ amount: 3 })] },
		});

		const a = await customerUsageStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
			featureId: TestFeature.Messages,
		});
		const b = await customerUsageStripePriceId({
			ctx,
			customerId: customerBId,
			catalogProductId: pro.id,
			featureId: TestFeature.Messages,
		});

		expect(a.customerStripePriceId).toBeTruthy();
		expect(b.customerStripePriceId).toBeTruthy();
		expect(b.customerStripePriceId).not.toBe(a.customerStripePriceId);
		expect(b.customerStripePriceId).not.toBe(b.catalogStripePriceId);
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse custom usage: A allocated-v2 $20 then B $20 share Stripe")}`,
	async () => {
		const customerBId = "reuse-usage-b-alloc";
		const pro = products.pro({
			id: "reuse-usage-ab-alloc",
			items: [items.allocatedV2Users({ pricePerUnit: 10 })],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-usage-a-alloc",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: customerBId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		const customize20: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { items: [itemsV2.allocatedUsers({ amount: 20 })] },
		};

		await autumnV2_3.billing.attach<AttachParamsV1Input>(customize20);
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			...customize20,
			customer_id: customerBId,
		});

		await expectSharedUsageStripePrice({
			ctx,
			customerIds: [customerId, customerBId],
			catalogProductId: pro.id,
			featureId: TestFeature.Users,
		});
		await expectSharedUsageStripeProduct({
			ctx,
			customerIds: [customerId, customerBId],
			catalogProductId: pro.id,
			featureId: TestFeature.Users,
		});
	},
);
