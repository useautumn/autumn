/**
 * TDD test for the mintlify webhook miss: billing.create_schedule INSERTS an
 * active immediate-phase customer product and queues sendProductsUpdated for
 * it. The worker must then deliver a customer.products.updated webhook for
 * that newly-inserted active cusProduct.
 *
 * Real-world repro: req.id Root=1-6a0ba974-03e2b83621e4e34101d66c61 (mintlify
 * org GG6tnmO7cHb40PNhwYBTZtxQdeL74NHF, 2026-05-19T00:06:14Z):
 *   00:06:18.102 INFO  [billingPlanToSendProductsUpdated] Queued webhook for
 *                       Enterprise, scenario: upgrade
 *   00:06:18.125 WARN  [sendProductsUpdated] Customer product
 *                       cus_prod_3Dv4NvFlTFWBQXeIgELByDbl3lw not found
 * The inserted active cusProduct was lost between enqueue and worker pickup.
 *
 * Red-failure mode (current behavior):
 *  - waitForWebhook returns null after 20s; no customer.products.updated event
 *    is delivered for the immediate-phase plan inserted by createSchedule.
 *
 * Green-success criteria (after fix):
 *  - The customer.products.updated webhook is delivered with the immediate
 *    phase plan_id in updated_product.id.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiProduct,
	type CreateScheduleParamsV0Input,
	ms,
} from "@autumn/shared";
import chalk from "chalk";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

type CustomerProductsUpdatedPayload = {
	type: string;
	data: {
		scenario: string;
		customer: ApiCustomerV3;
		updated_product: ApiProduct;
	};
};

let webhook: WebhookTestSetup;
let playToken: string;

beforeAll(async () => {
	const appId = getTestSvixAppId({ svixConfig: ctx.org.svix_config });
	webhook = await setupWebhookTest({
		appId,
		filterTypes: ["customer.products.updated"],
	});
	playToken = webhook.playToken;
});

afterAll(async () => {
	await webhook?.cleanup();
});

test(
	`${chalk.yellowBright("sendProductsUpdated: multi-phase create_schedule fires webhook for inserted active cusProduct")}`,
	async () => {
		const customerId = "create-schedule-webhook-multiphase";

		const pro = products.pro({
			id: "pro-create-schedule-webhook",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium-create-schedule-webhook",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const now = Date.now();

		// Mirror mintlify's actual call pattern: multi-phase schedule —
		// immediate active plan (pro) + future scheduled plan (premium).
		// This produces a cusProduct with scheduled_ids populated, exactly
		// like cus_prod_3Dv4NvFlTFWBQXeIgELByDbl3lw in prod.
		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{ starts_at: now, plans: [{ plan_id: pro.id }] },
				{ starts_at: now + ms.days(30), plans: [{ plan_id: premium.id }] },
			],
		} satisfies CreateScheduleParamsV0Input);
		expect(response.status).toBe("created");

		// The immediate-phase pro cusProduct must deliver its
		// customer.products.updated webhook.
		const proWebhook = await waitForWebhook<CustomerProductsUpdatedPayload>({
			token: playToken,
			predicate: (payload) =>
				payload.type === "customer.products.updated" &&
				payload.data?.customer?.id === customerId &&
				payload.data?.updated_product?.id === pro.id,
			timeoutMs: 20_000,
		});

		expect(proWebhook).not.toBeNull();
		expect(proWebhook!.payload.data.updated_product.id).toBe(pro.id);
	},
);
