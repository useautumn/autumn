/**
 * Autumn-only cancel of an RC-managed subscription.
 *
 * Red (current):  billing.update with cancel_action + no_billing_changes on an
 *                 RC-managed cusProduct throws 409 "managed by RevenueCat".
 * Green (after):  the cancel goes through in Autumn only (no Stripe writes);
 *                 a cancel WITHOUT no_billing_changes stays blocked.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, AppEnv } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import {
	expectWebhookSuccess,
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_cancel_nb";

const setupRevenueCatOrg = async () => {
	if (
		ctx.org.processor_configs?.revenuecat?.sandbox_webhook_secret !==
		RC_WEBHOOK_SECRET
	) {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				processor_configs: {
					...ctx.org.processor_configs,
					revenuecat: {
						api_key: encryptData("mock_rc_api_key_live"),
						sandbox_api_key: encryptData("mock_rc_api_key_sandbox"),
						project_id: "mock_project_live",
						sandbox_project_id: "mock_project_sandbox",
						webhook_secret: RC_WEBHOOK_SECRET,
						sandbox_webhook_secret: RC_WEBHOOK_SECRET,
					},
				},
			},
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("revenuecat cancel no-billing: autumn-only cancel bypasses RC guard")}`,
	async () => {
		const customerId = "rc-cancel-nb-1";
		const RC_PRO_MONTHLY_ID = "com.app.rc_cancel_nb_pro_monthly";

		const proMonthly = products.base({
			id: "rc-cancel-nb-pro",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 10 }),
			],
		});

		await setupRevenueCatOrg();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proMonthly] }),
			],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: proMonthly.id,
				revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		const result = await rcClient.initialPurchase({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "rc_cancel_nb_tx_001",
		});
		expectWebhookSuccess(result);

		let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);

		// Guard still holds: a cancel WITHOUT no_billing_changes is blocked
		await expect(
			autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: proMonthly.id,
				cancel_action: "cancel_end_of_cycle" as const,
			}),
		).rejects.toThrow(/managed by RevenueCat/i);

		// Autumn-only cancel goes through
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: proMonthly.id,
			cancel_action: "cancel_end_of_cycle" as const,
			no_billing_changes: true,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].canceled_at).toBeDefined();
		expect(customer.products[0].canceled_at).not.toBeNull();
	},
);
