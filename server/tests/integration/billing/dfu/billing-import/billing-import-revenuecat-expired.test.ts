/**
 * dfu.flash RevenueCat hydration — an expired mock RC subscription hydrates the
 * omitted status to expired, yielding an Expired cusProduct with NO feature
 * access (leak-safe). RC read client is served entirely from mock fixtures.
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
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService.js";

test.concurrent(
	`${chalk.yellowBright("dfu.flash RC: expired subscription hydrates status=expired and grants no access")}`,
	async () => {
		const customerId = "dfu-flash-rc-expired";
		const appUserId = "rc_app_user_expired";
		const storeId = "com.app.dfu_rc_expired";
		const internalId = "prod_dfu_rc_expired_internal";
		const pro = rcSubscriptionProduct({ id: "dfu-rc-expired-pro" });

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

		const mock: RevenueCatMockFixtures = {
			products: [mockProduct({ internalId, storeId })],
			subscriptions: [
				mockSubscription({
					id: "rcsub_dfu_rc_expired",
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
							// status OMITTED — must be hydrated from the RC sub.
							plans: [{ plan_id: pro.id }],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload, mock);

		// Contract 1a: reported status hydrated to expired.
		const flashed = flashRes.result?.flashed?.find((f) => f.plan_id === pro.id);
		expect(flashed?.status).toBe("expired");

		// Contract 1b: cusProduct is Expired.
		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct?.status).toBe(CusProductStatus.Expired);

		// Contract 1c: leak-safe — no feature access.
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, notPresent: [pro.id] });
		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.remaining ?? 0).toBe(0);
	},
);
