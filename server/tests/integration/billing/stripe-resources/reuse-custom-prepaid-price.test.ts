/**
 * Customize A then B: same diverging prepaid price shares one V2 Stripe Price.
 *
 * Catalog reuse already ran. This path fires when stripe_prepaid_price_v2_id
 * is still empty (catalog $10 → customize $20).
 *
 * Contract:
 *   A $20 included 100 then B same → same V2, not catalog; V1 untouched
 *   A $20 then B $30, or same amount / different included → different V2
 *   A volume+flat then B same → share V2
 */

import { expect, test } from "bun:test";
import { type AttachParamsV1Input, TierInfinite } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	customerPrepaidStripePriceId,
	expectSharedPrepaidStripePrice,
} from "./utils/customerPrepaidStripePriceId";

const catalogPrepaid = () =>
	items.prepaidMessages({
		price: 10,
		includedUsage: 0,
		billingUnits: 100,
	});

const attachPrepaid = ({
	customerId,
	planId,
	item,
	quantity,
}: {
	customerId: string;
	planId: string;
	item: NonNullable<
		NonNullable<AttachParamsV1Input["customize"]>["items"]
	>[number];
	quantity: number;
}): AttachParamsV1Input => ({
	customer_id: customerId,
	plan_id: planId,
	feature_quantities: [{ feature_id: TestFeature.Messages, quantity }],
	customize: { items: [item] },
});

test.concurrent(
	`${chalk.yellowBright("reuse custom prepaid: A then B share V2, V1 untouched")}`,
	async () => {
		const customerBId = "reuse-prepaid-b-same";
		const pro = products.pro({
			id: "reuse-prepaid-ab-same",
			items: [catalogPrepaid()],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-prepaid-a-same",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: customerBId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		const customize = attachPrepaid({
			customerId,
			planId: pro.id,
			item: itemsV2.prepaidMessages({
				amount: 20,
				billingUnits: 100,
				included: 100,
			}),
			quantity: 200,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>(customize);
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			...customize,
			customer_id: customerBId,
		});

		await expectSharedPrepaidStripePrice({
			ctx,
			customerIds: [customerId, customerBId],
			catalogProductId: pro.id,
			featureId: TestFeature.Messages,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse custom prepaid: amount or included miss mints different V2")}`,
	async () => {
		const customerBId = "reuse-prepaid-b-diverge";
		const customerCId = "reuse-prepaid-c-included";
		const pro = products.pro({
			id: "reuse-prepaid-ab-diverge",
			items: [catalogPrepaid()],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-prepaid-a-diverge",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([
					{ id: customerBId, paymentMethod: "success" },
					{ id: customerCId, paymentMethod: "success" },
				]),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>(
			attachPrepaid({
				customerId,
				planId: pro.id,
				item: itemsV2.prepaidMessages({ amount: 20, billingUnits: 100 }),
				quantity: 100,
			}),
		);
		await autumnV2_3.billing.attach<AttachParamsV1Input>(
			attachPrepaid({
				customerId: customerBId,
				planId: pro.id,
				item: itemsV2.prepaidMessages({ amount: 30, billingUnits: 100 }),
				quantity: 100,
			}),
		);
		await autumnV2_3.billing.attach<AttachParamsV1Input>(
			attachPrepaid({
				customerId: customerCId,
				planId: pro.id,
				item: itemsV2.prepaidMessages({
					amount: 20,
					billingUnits: 100,
					included: 100,
				}),
				quantity: 200,
			}),
		);

		const a = await customerPrepaidStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
			featureId: TestFeature.Messages,
		});
		const b = await customerPrepaidStripePriceId({
			ctx,
			customerId: customerBId,
			catalogProductId: pro.id,
			featureId: TestFeature.Messages,
		});
		const c = await customerPrepaidStripePriceId({
			ctx,
			customerId: customerCId,
			catalogProductId: pro.id,
			featureId: TestFeature.Messages,
		});

		expect(a.customer.v2).toBeTruthy();
		expect(b.customer.v2).toBeTruthy();
		expect(c.customer.v2).toBeTruthy();
		expect(b.customer.v2).not.toBe(a.customer.v2);
		expect(c.customer.v2).not.toBe(a.customer.v2);
		expect(a.customer.v2).not.toBe(a.catalog.v2);
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse custom prepaid: A volume+flat then B same share V2")}`,
	async () => {
		const customerBId = "reuse-prepaid-b-volume";
		const pro = products.pro({
			id: "reuse-prepaid-ab-volume",
			items: [catalogPrepaid()],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-prepaid-a-volume",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: customerBId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		const volumeFlat = itemsV2.volumePrepaidMessages({
			included: 0,
			billingUnits: 100,
			tiers: [
				{ to: 500, amount: 0, flat_amount: 50 },
				{ to: TierInfinite, amount: 0, flat_amount: 50 },
			],
		});

		const customize = attachPrepaid({
			customerId,
			planId: pro.id,
			item: volumeFlat,
			quantity: 100,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>(customize);
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			...customize,
			customer_id: customerBId,
		});

		await expectSharedPrepaidStripePrice({
			ctx,
			customerIds: [customerId, customerBId],
			catalogProductId: pro.id,
			featureId: TestFeature.Messages,
			v1Untouched: false,
		});
	},
);
