import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, AppEnv, type FullProduct } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { RCMappingService } from "@/external/revenueCat/services/RCMappingService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "rc1";
const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_12345";

// RevenueCat product IDs (what RC sends in webhooks)
const RC_PRO_MONTHLY_ID = "com.app.pro_monthly";
const RC_PRO_YEARLY_ID = "com.app.pro_yearly";

// Autumn product definitions
const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
});

const proMonthly = constructProduct({
	id: `${testCase}-pro-monthly`,
	type: "pro",
	items: [messagesFeature],
	isDefault: false,
});

const proYearly = constructProduct({
	id: `${testCase}-pro-yearly`,
	type: "pro",
	isAnnual: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
	isDefault: false,
});

// Store created products for use in tests
const createdProducts: FullProduct[] = [];

describe(chalk.yellowBright("rc1: RevenueCat webhook integration"), () => {
	const customerId = `${testCase}-customer`;
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

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
							api_key: "mock_rc_api_key_live",
							sandbox_api_key: "mock_rc_api_key_sandbox",
							project_id: "mock_project_live",
							sandbox_project_id: "mock_project_sandbox",
							webhook_secret: RC_WEBHOOK_SECRET,
							sandbox_webhook_secret: RC_WEBHOOK_SECRET,
						},
					},
				},
			});
		}

		// 2. Create Autumn products
		await initProductsV0({
			ctx,
			products: [proMonthly, proYearly],
			prefix: testCase,
		});

		// 3. Create RevenueCat -> Autumn product mappings
		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: proMonthly.id,
				revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
			},
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: proYearly.id,
				revenuecat_product_ids: [RC_PRO_YEARLY_ID],
			},
		});

		// 4. Create test customer
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});
	});

	test("should create customer with pro monthly product", async () => {
		const response = await fetch(
			`http://localhost:8080/webhooks/revenuecat/${ctx.org.id}/${ctx.env}`,
			{
				method: "POST",
				body: JSON.stringify({
					event: {
						type: "INITIAL_PURCHASE",
						product_id: RC_PRO_MONTHLY_ID,
						app_user_id: customerId,
						original_transaction_id: "1234567890",
					},
				}),
				headers: {
					"Content-Type": "application/json",
					Authorization: RC_WEBHOOK_SECRET,
				},
			},
		);
		const respData = await response.json();

		expect(
			response.status,
			`Response status should be 200, got ${response.status}`,
		).toBe(200);
		expect(
			respData,
			`Response data should be success: true. Recieved: ${JSON.stringify(respData)}`,
		).toEqual({ success: true });

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);
	});

	test("should upgrade customer to pro yearly product upon renewal", async () => {
		const response = await fetch(
			`http://localhost:8080/webhooks/revenuecat/${ctx.org.id}/${ctx.env}`,
			{
				method: "POST",
				body: JSON.stringify({
					event: {
						type: "RENEWAL",
						product_id: RC_PRO_YEARLY_ID,
						app_user_id: customerId,
						original_transaction_id: "1234567890",
					},
				}),
				headers: {
					"Content-Type": "application/json",
					Authorization: RC_WEBHOOK_SECRET,
				},
			},
		);
		const respData = await response.json();

		expect(
			response.status,
			`Response status should be 200, got ${response.status}`,
		).toBe(200);
		expect(
			respData,
			`Response data should be success: true. Recieved: ${JSON.stringify(respData)}`,
		).toEqual({ success: true });

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proYearly.id);
	});

	test("should downgrade customer to pro monthly product upon initial purchase", async () => {
		const response = await fetch(
			`http://localhost:8080/webhooks/revenuecat/${ctx.org.id}/${ctx.env}`,
			{
				method: "POST",
				body: JSON.stringify({
					event: {
						type: "INITIAL_PURCHASE",
						product_id: RC_PRO_MONTHLY_ID,
						app_user_id: customerId,
						original_transaction_id: "1234567890",
					},
				}),
				headers: {
					"Content-Type": "application/json",
					Authorization: RC_WEBHOOK_SECRET,
				},
			},
		);
		const respData = await response.json();

		expect(
			response.status,
			`Response status should be 200, got ${response.status}`,
		).toBe(200);
		expect(
			respData,
			`Response data should be success: true. Recieved: ${JSON.stringify(respData)}`,
		).toEqual({ success: true });

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);
	});

	test("should go to cancelling state upon cancellation", async () => {
		const response = await fetch(
			`http://localhost:8080/webhooks/revenuecat/${ctx.org.id}/${ctx.env}`,
			{
				method: "POST",
				body: JSON.stringify({
					event: {
						type: "CANCELLATION",
						product_id: RC_PRO_MONTHLY_ID,
						app_user_id: customerId,
						original_transaction_id: "1234567890",
					},
				}),
				headers: {
					"Content-Type": "application/json",
					Authorization: RC_WEBHOOK_SECRET,
				},
			},
		);
		const respData = await response.json();

		expect(
			response.status,
			`Response status should be 200, got ${response.status}`,
		).toBe(200);
		expect(
			respData,
			`Response data should be success: true. Recieved: ${JSON.stringify(respData)}`,
		).toEqual({ success: true });

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);
		const canceledAt = customer.products[0].canceled_at ?? 0;
		expect(typeof canceledAt).toBe("number");
		expect(Math.abs(Date.now() - canceledAt)).toBeLessThanOrEqual(3000);
	});

	test("should go to expired state upon expiration", async () => {
		const response = await fetch(
			`http://localhost:8080/webhooks/revenuecat/${ctx.org.id}/${ctx.env}`,
			{
				method: "POST",
				body: JSON.stringify({
					event: {
						type: "EXPIRATION",
						product_id: RC_PRO_MONTHLY_ID,
						app_user_id: customerId,
						original_transaction_id: "1234567890",
					},
				}),
				headers: {
					"Content-Type": "application/json",
					Authorization: RC_WEBHOOK_SECRET,
				},
			},
		);
		const respData = await response.json();

		expect(
			response.status,
			`Response status should be 200, got ${response.status}`,
		).toBe(200);
		expect(
			respData,
			`Response data should be success: true. Recieved: ${JSON.stringify(respData)}`,
		).toEqual({ success: true });

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(0);
	});
});
