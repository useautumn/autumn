import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";

const billingUnits = 12;
const pricePerUnit = 8;

/**
 * Subscription Update - Cancellation Integration Tests
 *
 * These tests verify that subscription updates correctly interact with
 * the cancellation flow, including uncanceling subscriptions when a
 * quantity update is performed on a canceled subscription.
 */

describe(`${chalk.yellowBright("subscription-update: uncanceling subscriptions")}`, () => {
	const customerId = "sub-update-uncancel";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const prepaidProduct = constructRawProduct({
		id: "prepaid_messages",
		items: [
			constructPrepaidItem({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [prepaidProduct],
			prefix: customerId,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * billingUnits,
				},
			],
		});
	});

	test("should cancel subscription", async () => {
		await autumnV1.cancel({
			customer_id: customerId,
			product_id: prepaidProduct.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);
		const subscription = customer.subscriptions?.find(
			(s) => s.plan_id === prepaidProduct.id,
		);

		expect(subscription).toBeDefined();
		expect(subscription?.canceled_at).toBeDefined();
		expect(subscription?.status).toBe("active");
	});

	test("should uncancel subscription when updating quantity", async () => {
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20 * billingUnits,
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);
		const subscription = customer.subscriptions?.find(
			(s) => s.plan_id === prepaidProduct.id,
		);

		expect(subscription).toBeDefined();
		expect(subscription?.canceled_at).toBeNull();
		expect(subscription?.status).toBe("active");

		const balance = customer.balances?.[TestFeature.Messages];
		expect(balance?.purchased_balance).toBe(20 * billingUnits);
	});

	test("should verify internal canceled flag is false", async () => {
		const fullCustomer = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const customerProduct = fullCustomer.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);

		expect(customerProduct?.canceled).toBe(false);
		expect(customerProduct?.canceled_at).toBeNull();
		expect(customerProduct?.ended_at).toBeNull();
	});
});
