/**
 * dfu.flash RevenueCat hydration — a one-off RC purchase hydrates only the
 * processor id + starts_at (no status inference); status stays the default active.
 */

import { expect, test } from "bun:test";
import { AppEnv, CusProductStatus } from "@autumn/shared";
import {
	type FlashClient,
	type RevenueCatMockFixtures,
	THIRTY_DAYS_MS,
	NOW,
	callFlash,
	getFlashedCustomerProduct,
	mockProduct,
	mockPurchase,
	rcOneOffProduct,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService.js";

test.concurrent(
	`${chalk.yellowBright("dfu.flash RC: one-off purchase hydrates processor id and starts_at only")}`,
	async () => {
		const customerId = "dfu-flash-rc-oneoff";
		const appUserId = "rc_app_user_oneoff";
		const storeId = "com.app.dfu_rc_oneoff";
		const internalId = "prod_dfu_rc_oneoff_internal";
		const purchaseId = "purchase_dfu_rc_oneoff";
		const purchasedAt = NOW - THIRTY_DAYS_MS;
		const oneOff = rcOneOffProduct({ id: "dfu-rc-oneoff-pack" });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [oneOff] })],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: oneOff.id,
				revenuecat_product_ids: [storeId],
			},
		});

		const mock: RevenueCatMockFixtures = {
			products: [mockProduct({ internalId, storeId, type: "one_time" })],
			subscriptions: [],
			purchases: [
				mockPurchase({
					id: purchaseId,
					internalProductId: internalId,
					purchasedAt,
				}),
			],
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
							plans: [{ plan_id: oneOff.id }],
						},
					],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload, mock);

		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: oneOff.id,
		});
		// Purchase hydrates only id + start; status stays the default active.
		expect(cusProduct?.processor?.id).toBe(purchaseId);
		expect(cusProduct?.starts_at).toBe(purchasedAt);
		expect(cusProduct?.status).toBe(CusProductStatus.Active);
	},
);
