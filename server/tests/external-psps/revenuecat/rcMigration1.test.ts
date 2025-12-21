import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	AppEnv,
	CusProductStatus,
	customers,
	ProcessorType,
} from "@autumn/shared";
import { replaceItems } from "@tests/attach/utils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../utils/genUtils.js";
import {
	expectWebhookSuccess,
	RevenueCatWebhookClient,
} from "./utils/RevenueCatWebhookClient.js";

const testCase = "rcMigration1";
const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_migration";

// RevenueCat product ID
const RC_PRO_MONTHLY_ID = "com.app.migration_pro_monthly";

// Autumn product definitions
const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
});

const proMonthlyV1 = constructProduct({
	id: `${testCase}-pro-monthly`,
	type: "pro",
	items: [messagesFeature],
	isDefault: false,
});

describe(
	chalk.yellowBright("rcMigration1: RevenueCat customer migration"),
	() => {
		const customerId = `${testCase}-customer`;
		const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
		let internalCustomerId: string | null = null;
		let rcClient: RevenueCatWebhookClient;

		beforeAll(async () => {
			// 1. Configure org with RevenueCat processor config
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

			// 2. Create product and mappings
			await initProductsV0({
				ctx,
				products: [proMonthlyV1],
				prefix: testCase,
				customerId,
			});

			await RCMappingService.upsert({
				db: ctx.db,
				data: {
					org_id: ctx.org.id,
					env: AppEnv.Sandbox,
					autumn_product_id: proMonthlyV1.id,
					revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
				},
			});

			// 3. Create customer
			await initCustomerV3({
				ctx,
				customerId,
				withTestClock: false,
			});

			const dbCustomer = await ctx.db.query.customers.findFirst({
				where: eq(customers.id, customerId),
			});
			expect(dbCustomer).toBeDefined();
			internalCustomerId = dbCustomer!.internal_id;

			// Initialize RevenueCat webhook client
			rcClient = new RevenueCatWebhookClient({
				orgId: ctx.org.id,
				env: ctx.env,
				webhookSecret: RC_WEBHOOK_SECRET,
			});
		});

		test("should create customer with pro monthly v1 product via initial purchase", async () => {
			const { response, data } = await rcClient.initialPurchase({
				productId: RC_PRO_MONTHLY_ID,
				appUserId: customerId,
				originalTransactionId: "migration_tx_12345",
			});

			expectWebhookSuccess({ response, data });

			const customer = await autumnV1.customers.get(customerId);
			expect(customer).toBeDefined();
			expect(customer.products).toHaveLength(1);
			expect(customer.products[0].id).toBe(proMonthlyV1.id);

			// Verify cus_product has RevenueCat processor
			const cusProducts = await CusProductService.list({
				db: ctx.db,
				internalCustomerId: internalCustomerId!,
				inStatuses: [CusProductStatus.Active],
			});
			expect(cusProducts).toHaveLength(1);
			expect(cusProducts[0].processor?.type).toBe(ProcessorType.RevenueCat);
		});

		test("should create v2 of the product with updated features", async () => {
			// Create v2 with increased usage
			const newItems = replaceItems({
				items: proMonthlyV1.items,
				featureId: TestFeature.Messages,
				newItem: constructFeatureItem({
					featureId: TestFeature.Messages,
					includedUsage: 2000, // Increased from 1000
				}),
			});

			await autumnV1.products.update(proMonthlyV1.id, {
				items: newItems,
			});
		});

		test("should migrate customer from v1 to v2", async () => {
			await autumnV1.track({
				customer_id: customerId,
				value: 500,
				feature_id: TestFeature.Messages,
			});

			await timeout(2000);

			// Run migration via API
			await autumnV1.migrate({
				from_product_id: proMonthlyV1.id,
				to_product_id: proMonthlyV1.id,
				from_version: 1,
				to_version: 2,
			});

			// Wait for migration to complete
			await new Promise((resolve) => setTimeout(resolve, 4000));

			// Verify customer now has v2 product
			const cusProducts = await CusProductService.list({
				db: ctx.db,
				internalCustomerId: internalCustomerId!,
				inStatuses: [CusProductStatus.Active],
			});

			expect(cusProducts).toHaveLength(1);
			expect(cusProducts[0].processor?.type).toBe(ProcessorType.RevenueCat);

			// Verify old cus_product is expired
			const allCusProducts = await CusProductService.list({
				db: ctx.db,
				internalCustomerId: internalCustomerId!,
				inStatuses: undefined,
			});

			const expiredCusProducts = allCusProducts.filter(
				(cp) => cp.status === CusProductStatus.Expired,
			);
			expect(expiredCusProducts.length).toBeGreaterThanOrEqual(1);
		});

		// test("should have correct entitlements after migration", async () => {
		// 	const customer = await autumnV1.customers.get(customerId);

		// 	expect(customer).toBeDefined();
		// 	expect(customer.products).toHaveLength(1);
		// 	expect(customer.products[0].id).toBe(proMonthlyV1.id);

		// 	// Verify the new entitlements (2000 messages from v2)
		// 	const messagesFeature = customer.features[TestFeature.Messages];
		// 	expect(messagesFeature).toBeDefined();
		// 	expect(messagesFeature.balance).toBe(2000);
		// });
	},
);
