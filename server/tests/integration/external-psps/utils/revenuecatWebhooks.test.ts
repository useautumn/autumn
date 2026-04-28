import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	AppEnv,
	CusProductStatus,
	customers,
	revenuecatMappings,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { and, arrayOverlaps, eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import {
	expectWebhookSuccess,
	RevenueCatWebhookClient,
} from "./revenue-cat-webhook-client.js";

const testCase = "rc1";
const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_12345";

// RevenueCat product IDs (what RC sends in webhooks)
const RC_PRO_MONTHLY_ID = "com.app.pro_monthly";
const RC_PRO_YEARLY_ID = "com.app.pro_yearly";
const RC_ADD_ON_ID = "com.app.add_on_pack";

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

const addOnPack = constructProduct({
	id: `${testCase}-add-on`,
	type: "one_off",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	isAddOn: true,
	isDefault: false,
});

describe(chalk.yellowBright("rc1: RevenueCat webhook integration"), () => {
	const customerId = `${testCase}-customer`;
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
	let proMonthlyCusProductId: string | null = null;
	let internalCustomerId: string | null = null;
	let rcClient: RevenueCatWebhookClient;

	const fetchLatestActiveCusProductId = async () => {
		if (!internalCustomerId) {
			throw new Error("internalCustomerId not set");
		}

		const cusProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId,
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.PastDue,
				CusProductStatus.Scheduled,
			],
		});

		const activeSorted = cusProducts
			.filter(
				(cp) =>
					cp.status === CusProductStatus.Active ||
					cp.status === CusProductStatus.PastDue,
			)
			.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

		expect(
			activeSorted.length > 0,
			"Expected at least one active cus_product for customer",
		).toBe(true);

		// Return the latest active cus_product id for the customer
		return activeSorted[activeSorted.length - 1]!.id;
	};

	const fetchLatestCusProductIdAnyStatus = async () => {
		if (!internalCustomerId) {
			throw new Error("internalCustomerId not set");
		}

		const cusProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId,
			inStatuses: undefined,
		});

		if (cusProducts.length === 0) {
			return null;
		}

		const sorted = [...cusProducts].sort(
			(a, b) => (a.created_at ?? 0) - (b.created_at ?? 0),
		);

		return sorted[sorted.length - 1]!.id;
	};

	const getBaselineCusProductId = () => {
		if (!proMonthlyCusProductId) {
			throw new Error(
				"Baseline CusProduct ID was not set from initial purchase",
			);
		}

		return proMonthlyCusProductId;
	};
	const updateBaselineCusProductId = (cusProductId: string) => {
		proMonthlyCusProductId = cusProductId;
	};

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

		// Initialize RevenueCat webhook client
		rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		// IMPORTANT: clean up stale RC mappings before re-upserting.
		//
		// `addPrefixToProducts` was changed in Jan from prefix-style
		// (`${prefix}_${id}`) to suffix-style (`${id}_${prefix}`). Old runs left
		// rows in `revenuecat_mappings` keyed by the prefix-style autumn_product_id
		// (e.g. `rc1_rc1-pro-monthly`). The mapping table PK includes
		// `autumn_product_id`, so a fresh upsert under the new ID does NOT
		// overwrite the stale row. The resolver's `arrayContains` lookup can then
		// return the stale row, causing `ProductNotFoundError`.
		//
		// Clear by `revenuecat_product_ids` overlap so the cleanup is independent
		// of whatever stale autumn_product_id format was used previously.
		await ctx.db
			.delete(revenuecatMappings)
			.where(
				and(
					eq(revenuecatMappings.org_id, ctx.org.id),
					eq(revenuecatMappings.env, AppEnv.Sandbox),
					arrayOverlaps(revenuecatMappings.revenuecat_product_ids, [
						RC_PRO_MONTHLY_ID,
						RC_PRO_YEARLY_ID,
						RC_ADD_ON_ID,
					]),
				),
			);

		// Create products + customer concurrently. Products must finish before
		// we read their (post-prefix) IDs for the mappings below.
		await Promise.all([
			initProductsV0({
				ctx,
				products: [proMonthly, proYearly, addOnPack],
				prefix: testCase,
			}),
			initCustomerV3({
				ctx,
				customerId,
				withTestClock: false,
			}),
		]);

		// Now that initProductsV0 has mutated the product IDs (suffix-style),
		// upsert mappings with the final, correct autumn_product_id values.
		await Promise.all([
			RCMappingService.upsert({
				db: ctx.db,
				data: {
					org_id: ctx.org.id,
					env: AppEnv.Sandbox,
					autumn_product_id: proMonthly.id,
					revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
				},
			}),
			RCMappingService.upsert({
				db: ctx.db,
				data: {
					org_id: ctx.org.id,
					env: AppEnv.Sandbox,
					autumn_product_id: addOnPack.id,
					revenuecat_product_ids: [RC_ADD_ON_ID],
				},
			}),
			RCMappingService.upsert({
				db: ctx.db,
				data: {
					org_id: ctx.org.id,
					env: AppEnv.Sandbox,
					autumn_product_id: proYearly.id,
					revenuecat_product_ids: [RC_PRO_YEARLY_ID],
				},
			}),
		]);

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		expect(dbCustomer).toBeDefined();
		internalCustomerId = dbCustomer!.internal_id;
	});

	test("should create customer with pro monthly product", async () => {
		const result = await rcClient.initialPurchase({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "1234567890",
		});
		expectWebhookSuccess(result);

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);

		proMonthlyCusProductId = await fetchLatestActiveCusProductId();
	});

	test("should upgrade customer to pro yearly product upon renewal", async () => {
		const result = await rcClient.renewal({
			productId: RC_PRO_YEARLY_ID,
			appUserId: customerId,
			originalTransactionId: "1234567890",
		});
		expectWebhookSuccess(result);

		await fetchLatestActiveCusProductId();
		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proYearly.id);
	});

	test("should downgrade customer to pro monthly product upon initial purchase", async () => {
		const result = await rcClient.initialPurchase({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "1234567890",
		});
		expectWebhookSuccess(result);

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);

		const currentCusProductId = await fetchLatestActiveCusProductId();
		console.log("currentCusProductId", currentCusProductId);
		expect(currentCusProductId).not.toBe(getBaselineCusProductId());
		updateBaselineCusProductId(currentCusProductId);
	});

	test("should go to cancelling state upon cancellation", async () => {
		const result = await rcClient.cancellation({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "1234567890",
			expirationAtMs: Date.now() + 1000 * 60 * 60 * 24 * 30,
		});
		expectWebhookSuccess(result);

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);
		const canceledAt = customer.products[0].canceled_at ?? 0;
		expect(typeof canceledAt).toBe("number");
		expect(Math.abs(Date.now() - canceledAt)).toBeLessThanOrEqual(3000);

		const currentCusProductId = await fetchLatestActiveCusProductId();
		expect(currentCusProductId).toBe(getBaselineCusProductId());
	});

	test("should uncancel customer after cancellation event", async () => {
		const result = await rcClient.uncancellation({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
		});
		expectWebhookSuccess(result);

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);
		expect(customer.products[0].canceled_at).toBeNull();

		const currentCusProductId = await fetchLatestActiveCusProductId();
		expect(currentCusProductId).toBe(getBaselineCusProductId());
	});

	test("should mark product as past due upon billing issue", async () => {
		const result = await rcClient.billingIssue({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "1234567890",
		});
		expectWebhookSuccess(result);

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(proMonthly.id);
		expect(String(customer.products[0].status)).toBe("past_due");

		const currentCusProductId = await fetchLatestActiveCusProductId();
		expect(currentCusProductId).toBe(getBaselineCusProductId());
	});

	test("should go to expired state upon expiration", async () => {
		const result = await rcClient.expiration({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "1234567890",
		});
		expectWebhookSuccess(result);

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(0);

		const latestCusProductId = await fetchLatestCusProductIdAnyStatus();
		// After expiration, there may no longer be a cus_product row at all. In that
		// case, we just assert there are no cus_products for this customer anymore.
		if (latestCusProductId === null) {
			const allCusProducts = await CusProductService.list({
				db: ctx.db,
				internalCustomerId: internalCustomerId!,
				inStatuses: undefined,
			});
			expect(allCusProducts.length).toBe(0);
		} else {
			expect(latestCusProductId).toBe(getBaselineCusProductId());
		}
	});

	test("should attach add-on product after expiration via non-renewing purchase", async () => {
		const result = await rcClient.nonRenewingPurchase({
			productId: RC_ADD_ON_ID,
			appUserId: customerId,
			originalTransactionId: "add_on_tx_12345",
		});
		expectWebhookSuccess(result);

		const customer = await autumnV1.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(addOnPack.id);

		const addOnCusProducts = await CusProductService.getByProductId({
			db: ctx.db,
			productId: addOnPack.id,
			orgId: ctx.org.id,
			env: ctx.env,
			limit: 1,
		});
		expect(
			addOnCusProducts.length > 0,
			`CusProduct for add-on product ${addOnPack.id} should exist`,
		).toBe(true);
		const addOnCusProductId = addOnCusProducts[0]!.id;
		expect(typeof addOnCusProductId).toBe("string");
	});
});
