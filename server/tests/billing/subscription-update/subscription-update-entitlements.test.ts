import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
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
 * Subscription Update - Entitlement Balance Tests
 *
 * These tests verify that subscription updates correctly update customer
 * entitlement balances at the database level. These are lower-level tests
 * that check internal state using CusService.getFull() to ensure the
 * balance increment/decrement logic works correctly.
 */

describe(`${chalk.yellowBright("subscription-update: entitlement balance updates")}`, () => {
	const customerId = "sub-update-entitlements";
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

	test("should increment entitlement balance on upgrade", async () => {
		const beforeUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const customerProduct = beforeUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const beforeEntitlement = customerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const beforeBalance = beforeEntitlement?.balance || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 15 * billingUnits, // +5 units
				},
			],
		});

		const afterUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const afterCustomerProduct = afterUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const afterBalance = afterEntitlement?.balance || 0;

		// +5 units × 12 billing_units = +60 messages
		expect(afterBalance).toBe(beforeBalance + 60);
	});

	test("should decrement entitlement balance on downgrade", async () => {
		const beforeUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const customerProduct = beforeUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const beforeEntitlement = customerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const beforeBalance = beforeEntitlement?.balance || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * billingUnits, // -5 units
				},
			],
		});

		const afterUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const afterCustomerProduct = afterUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const afterBalance = afterEntitlement?.balance || 0;

		// -5 units × 12 billing_units = -60 messages
		expect(afterBalance).toBe(beforeBalance - 60);
	});
});
