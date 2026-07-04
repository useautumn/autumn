/**
 * dfu.flash RevenueCat hydration — explicit payload status wins over the mock RC
 * subscription status (payload active despite an expired mock sub).
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, AppEnv, CusProductStatus } from "@autumn/shared";
import {
	type FlashClient,
	type RevenueCatMockFixtures,
	THIRTY_DAYS_MS,
	NOW,
	callFlash,
	getFlashedCustomerProduct,
	mockProduct,
	mockSubscription,
	rcSubscriptionProduct,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService.js";

test.concurrent(
	`${chalk.yellowBright("dfu.flash RC: payload status wins over hydrated RC subscription status")}`,
	async () => {
		const customerId = "dfu-flash-rc-precedence";
		const appUserId = "rc_app_user_precedence";
		const storeId = "com.app.dfu_rc_precedence";
		const internalId = "prod_dfu_rc_precedence_internal";
		const pro = rcSubscriptionProduct({ id: "dfu-rc-precedence-pro" });

		const { autumnV2_2, autumnV2_3, ctx } = await initScenario({
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

		// Mock sub is expired; payload says active → payload must win.
		const mock: RevenueCatMockFixtures = {
			products: [mockProduct({ internalId, storeId })],
			subscriptions: [
				mockSubscription({
					id: "rcsub_dfu_rc_precedence",
					internalProductId: internalId,
					status: "expired",
					periodEndsAt: NOW - THIRTY_DAYS_MS,
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

		// Payload active wins despite the hydrated Expired.
		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct?.status).toBe(CusProductStatus.Active);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.remaining ?? 0).toBe(100);
	},
);
