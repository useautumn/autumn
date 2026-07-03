/**
 * dfu.flash RevenueCat hydration — processors.revenuecat.id is seeded on the
 * customer after flash.
 */

import { expect, test } from "bun:test";
import { AppEnv, customers } from "@autumn/shared";
import {
	type FlashClient,
	type RevenueCatMockFixtures,
	callFlash,
	mockProduct,
	mockSubscription,
	rcSubscriptionProduct,
} from "@tests/integration/billing/dfu/dfu-flash/utils/flashTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService.js";

test.concurrent(
	`${chalk.yellowBright("dfu.flash RC: seeds processors.revenuecat.id on the customer")}`,
	async () => {
		const customerId = "dfu-flash-rc-seed";
		const appUserId = "rc_app_user_seed_email@example.com";
		const storeId = "com.app.dfu_rc_seed";
		const internalId = "prod_dfu_rc_seed_internal";
		const pro = rcSubscriptionProduct({ id: "dfu-rc-seed-pro" });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: pro.id,
				revenuecat_product_ids: [storeId],
			},
		});

		const mock: RevenueCatMockFixtures = {
			products: [mockProduct({ internalId, storeId })],
			subscriptions: [
				mockSubscription({
					id: "rcsub_dfu_rc_seed",
					internalProductId: internalId,
					status: "active",
				}),
			],
			purchases: [],
		};

		const payload = {
			customer_id: customerId,
			processors: [{ type: "revenuecat", id: appUserId }],
			billables: [
				{
					processor: "revenuecat",
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id, status: "active" }],
						},
					],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload, mock);

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		expect(dbCustomer?.processors?.revenuecat?.id).toBe(appUserId);
	},
);
