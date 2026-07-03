/**
 * dfu.flash — internal fields (contract 8): `entities` is marked
 * .meta({ internal: true }) so docs hide it, but the schema still accepts a
 * payload carrying it without a 400 (field is defined + optional).
 */

import { expect, test } from "bun:test";
import {
	type FlashClient,
	callFlash,
	createRealStripeSub,
} from "@tests/integration/billing/dfu/dfu-flash/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: internal entities field is accepted (docs hide it)")}`,
	async () => {
		const customerId = "dfu-flash-internal-fields";
		const pro = products.pro({
			id: "dfu-internal-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		const { customerId: stripeCustomerId, subscriptionId } =
			await createRealStripeSub(ctx, { email: `${customerId}@example.com` });
		const { subscriptionId: entitySubscriptionId } = await createRealStripeSub(
			ctx,
			{ email: `${customerId}@example.com`, customerId: stripeCustomerId },
		);

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: stripeCustomerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: subscriptionId },
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id, status: "active" }],
						},
					],
				},
			],
			entities: [
				{
					entity_id: "ws_A",
					feature_id: TestFeature.Users,
					billables: [
						{
							processor: "stripe",
							link: { subscription_id: entitySubscriptionId },
							phases: [
								{
									starts_at: "now",
									plans: [{ plan_id: pro.id, status: "active" }],
								},
							],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// Payload with internal `entities` must not be rejected as a bad request.
		expect(flashRes.errorCode).not.toBe("invalid_request");
		expect(flashRes.errorCode).not.toBe("invalid_inputs");
	},
);
