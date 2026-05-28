/**
 * TDD test for RevenueCat EXPIRATION crash when free-default activation runs.
 *
 * Red-failure mode (current behavior):
 *  - resolveRevenuecatResources fetches customer without `withEntities: true`,
 *    so `fullCustomer.entities` is `undefined`. EXPIRATION → expireAndActivateDefault
 *    → activateFreeDefaultProduct → initFullCustomerProductFromProduct →
 *    applyExistingStatesToCustomerProduct passes `entities: undefined` to
 *    mergeEntitiesWithExistingUsages, where `for (const entity of entities)`
 *    throws: "undefined is not an object (evaluating 'entities')".
 *  - The DB status=Expired write succeeded before the crash, so the customer ends
 *    up with the pro product expired AND no free default attached (no plan).
 *
 * Green-success criteria (after fix):
 *  - EXPIRATION webhook completes successfully (200).
 *  - Pro product is removed from active set.
 *  - Free default product is attached as active.
 *
 * Real-world repro: customer JfB02xZKR79Qim8SVPbqSQErX433basl in org `runable`.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import {
	expectWebhookSuccess,
	RevenueCatWebhookClient,
} from "@tests/integration/external-psps/revenuecat/utils/revenue-cat-webhook-client.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import chalk from "chalk";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_no_entities";

beforeAll(async () => {
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
});

afterAll(async () => {});

test(
	`${chalk.yellowBright("rc-webhook: expiration with free-default activates default without crashing on undefined entities")}`,
	async () => {
		const customerId = "rc-webhook-expire-no-entities";
		const RC_PRO_MONTHLY_ID = "com.app.rcwh_no_entities_pro_monthly";

		const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const freeDefault = products.base({
			id: "free-default-no-entities",
			items: [items.monthlyMessages({ includedUsage: 10 })],
			isDefault: true,
		});
		const proMonthly = products.pro({
			id: "pro-monthly-no-entities",
			items: [messagesItem],
		});

		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [freeDefault, proMonthly] }),
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

		const initialResult = await rcClient.initialPurchase({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "rcwh_no_entities_tx_001",
		});
		expectWebhookSuccess(initialResult);

		// Then: expiration. Without the fix this returns 500 and never attaches the default.
		const expireResult = await rcClient.expiration({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "rcwh_no_entities_tx_001",
		});
		expectWebhookSuccess(expireResult);

		await expectCustomerProducts({
			customerId,
			active: [freeDefault.id],
			notPresent: [proMonthly.id],
		});
	},
	30_000,
);
