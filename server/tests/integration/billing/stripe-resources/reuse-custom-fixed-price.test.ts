/**
 * Customize A then B: same diverging fixed price shares one Stripe Price.
 *
 * Catalog / variant reuse already ran. This path only fires when the
 * attach-currency slot is still empty (Pro $20 → customize $25).
 *
 * Contract:
 *   A $25 then B $25 → same stripe_price_id, not the catalog $20 id
 *   A $25 then B catalog $20 → B uses the catalog id
 *   A $25 then B $30 → different stripe_price_ids
 *   A attach $25 then C updateSubscription → $25 → same Stripe as A
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	customerFixedStripePriceId,
	expectSharedFixedStripePrice,
} from "./utils/customerFixedStripePriceId";

test.concurrent(
	`${chalk.yellowBright("reuse custom fixed: A $25 then B $25 share one Stripe Price")}`,
	async () => {
		const customerBId = "reuse-custom-b-same";
		const pro = products.pro({ id: "reuse-custom-ab-same", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-custom-a-same",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: customerBId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		const customize25: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 25 }) },
		};

		await autumnV2_3.billing.attach<AttachParamsV1Input>(customize25);
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			...customize25,
			customer_id: customerBId,
		});

		const a = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});
		const b = await customerFixedStripePriceId({
			ctx,
			customerId: customerBId,
			catalogProductId: pro.id,
		});

		expect(a.customerStripePriceId).toBeTruthy();
		expect(b.customerStripePriceId).toBe(a.customerStripePriceId);
		expect(a.customerStripePriceId).not.toBe(a.catalogStripePriceId);

		const customerA = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const customerB =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerBId);
		await expectCustomerProducts({ customer: customerA, active: [pro.id] });
		await expectCustomerProducts({ customer: customerB, active: [pro.id] });
		await expectStripeSubscriptionCorrect({ ctx, customerId });
		await expectStripeSubscriptionCorrect({ ctx, customerId: customerBId });
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse custom fixed: A $25 then B catalog $20 uses catalog Stripe Price")}`,
	async () => {
		const customerBId = "reuse-custom-b-catalog";
		const pro = products.pro({ id: "reuse-custom-ab-catalog", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-custom-a-catalog",
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
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerBId,
			plan_id: pro.id,
		});

		const a = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});
		const b = await customerFixedStripePriceId({
			ctx,
			customerId: customerBId,
			catalogProductId: pro.id,
		});

		expect(a.customerStripePriceId).toBeTruthy();
		expect(b.customerStripePriceId).toBe(b.catalogStripePriceId);
		expect(b.customerStripePriceId).not.toBe(a.customerStripePriceId);
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse custom fixed: A $25 then B $30 mint different Stripe Prices")}`,
	async () => {
		const customerBId = "reuse-custom-b-diverge";
		const pro = products.pro({ id: "reuse-custom-ab-diverge", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-custom-a-diverge",
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
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerBId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 30 }) },
		});

		const a = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});
		const b = await customerFixedStripePriceId({
			ctx,
			customerId: customerBId,
			catalogProductId: pro.id,
		});

		expect(a.customerStripePriceId).toBeTruthy();
		expect(b.customerStripePriceId).toBeTruthy();
		expect(b.customerStripePriceId).not.toBe(a.customerStripePriceId);
		expect(b.customerStripePriceId).not.toBe(b.catalogStripePriceId);
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse custom fixed: A attach $25 then C updateSubscription $25 share Stripe")}`,
	async () => {
		const customerCId = "reuse-custom-c-update";
		const pro = products.pro({ id: "reuse-custom-ac-update", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-custom-a-update",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: customerCId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 25 }) },
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerCId,
			plan_id: pro.id,
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerCId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 25 }) },
		});

		await expectSharedFixedStripePrice({
			ctx,
			customerIds: [customerId, customerCId],
			catalogProductId: pro.id,
		});
	},
);
