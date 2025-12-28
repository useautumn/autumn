import { describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";

const billingUnits = 12;
const pricePerUnit = 8; // $8 per unit = $96 for 12 units

/**
 * Proration Configuration Tests
 *
 * These tests verify that the subscription update flow correctly handles
 * all proration configurations for both upgrades and downgrades.
 *
 * OnIncrease configs:
 * - BillImmediately: Bill full amount now (no proration)
 * - ProrateImmediately: Prorate and bill now (default)
 * - ProrateNextCycle: Prorate but bill next cycle
 * - BillNextCycle: Bill full amount next cycle
 *
 * OnDecrease configs:
 * - ProrateImmediately: Credit prorated amount now
 * - ProrateNextCycle: Credit next cycle
 * - None: No credit (replaceable strategy - set upcoming_quantity)
 * - NoProrations: No credit at all
 */

describe(`${chalk.yellowBright("subscription-update: proration configs - upgrades")}`, () => {
	const customerId = "sub-update-proration-upgrade";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const createProductWithProrationConfig = (
		productId: string,
		onIncrease: OnIncrease,
	) =>
		constructRawProduct({
			id: productId,
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
					config: {
						on_increase: onIncrease,
						on_decrease: OnDecrease.ProrateImmediately,
					},
				}),
			],
		});

	test("OnIncrease.ProrateImmediately - should charge prorated amount immediately", async () => {
		const product = createProductWithProrationConfig(
			"prorate_immediately",
			OnIncrease.ProrateImmediately,
		);

		await initCustomerV3({
			ctx,
			customerId: `${customerId}-prorate-immediately`,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [product],
			prefix: customerId,
		});

		await autumnV1.attach({
			customer_id: `${customerId}-prorate-immediately`,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * billingUnits,
				},
			],
		});

		const beforeInvoices = await autumnV1.customers.get<ApiCustomer>(
			`${customerId}-prorate-immediately`,
		);
		const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

		// Upgrade to 20 units
		await autumnV1.subscriptionUpdate({
			customer_id: `${customerId}-prorate-immediately`,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20 * billingUnits,
				},
			],
		});

		const afterUpdate = await autumnV1.customers.get<ApiCustomer>(
			`${customerId}-prorate-immediately`,
		);

		// Should create invoice
		expect(afterUpdate.invoices?.length).toBeGreaterThan(invoiceCountBefore);

		const latestInvoice = afterUpdate.invoices?.[0];
		expect(latestInvoice?.status).toBe("paid");

		// Should charge PRORATED amount (less than full $80)
		// Exact amount depends on time remaining in billing cycle
		const fullAmount = 10 * pricePerUnit;
		expect(latestInvoice?.total).toBeGreaterThan(0);
		expect(latestInvoice?.total).toBeLessThanOrEqual(fullAmount);
	});

	test("OnIncrease.ProrateNextCycle - should defer invoice to next cycle", async () => {
		const product = createProductWithProrationConfig(
			"prorate_next_cycle",
			OnIncrease.ProrateNextCycle,
		);

		await initCustomerV3({
			ctx,
			customerId: `${customerId}-prorate-next-cycle`,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [product],
			prefix: customerId,
		});

		await autumnV1.attach({
			customer_id: `${customerId}-prorate-next-cycle`,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * billingUnits,
				},
			],
		});

		const beforeInvoices = await autumnV1.customers.get<ApiCustomer>(
			`${customerId}-prorate-next-cycle`,
		);
		const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

		// Upgrade to 20 units
		await autumnV1.subscriptionUpdate({
			customer_id: `${customerId}-prorate-next-cycle`,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20 * billingUnits,
				},
			],
		});

		const afterUpdate = await autumnV1.customers.get<ApiCustomer>(
			`${customerId}-prorate-next-cycle`,
		);

		// Should NOT create finalized invoice immediately
		const finalizedInvoices = afterUpdate.invoices?.filter(
			(inv) => inv.status === "paid" || inv.status === "open",
		);
		expect(finalizedInvoices?.length).toBe(invoiceCountBefore);

		// But balance should be updated immediately
		const balance = afterUpdate.balances?.[TestFeature.Messages];
		expect(balance?.purchased_balance).toBe(20 * billingUnits);

		// TODO: Verify invoice items exist for next billing cycle
	});

	test("OnIncrease.BillNextCycle - should defer full invoice to next cycle", async () => {
		const product = createProductWithProrationConfig(
			"bill_next_cycle",
			OnIncrease.BillNextCycle,
		);

		await initCustomerV3({
			ctx,
			customerId: `${customerId}-bill-next-cycle`,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [product],
			prefix: customerId,
		});

		await autumnV1.attach({
			customer_id: `${customerId}-bill-next-cycle`,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * billingUnits,
				},
			],
		});

		const beforeInvoices = await autumnV1.customers.get<ApiCustomer>(
			`${customerId}-bill-next-cycle`,
		);
		const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

		// Upgrade to 20 units
		await autumnV1.subscriptionUpdate({
			customer_id: `${customerId}-bill-next-cycle`,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20 * billingUnits,
				},
			],
		});

		const afterUpdate = await autumnV1.customers.get<ApiCustomer>(
			`${customerId}-bill-next-cycle`,
		);

		// Should NOT create invoice immediately
		expect(afterUpdate.invoices?.length).toBe(invoiceCountBefore);

		// But balance should be updated
		const balance = afterUpdate.balances?.[TestFeature.Messages];
		expect(balance?.purchased_balance).toBe(20 * billingUnits);
	});
});

describe(`${chalk.yellowBright("subscription-update: proration configs - downgrades")}`, () => {
	const customerId = "sub-update-proration-downgrade";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const createProductWithProrationConfig = (
		productId: string,
		onDecrease: OnDecrease,
	) =>
		constructRawProduct({
			id: productId,
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
					config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: onDecrease,
					},
				}),
			],
		});

	test("OnDecrease.ProrateImmediately - should credit prorated amount immediately", async () => {
		const product = createProductWithProrationConfig(
			"downgrade_prorate_immediately",
			OnDecrease.ProrateImmediately,
		);

		await initCustomerV3({
			ctx,
			customerId: `${customerId}-prorate-immediately`,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [product],
			prefix: customerId,
		});

		// Attach with 20 units
		await autumnV1.attach({
			customer_id: `${customerId}-prorate-immediately`,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20 * billingUnits,
				},
			],
		});

		const beforeInvoices = await autumnV1.customers.get<ApiCustomer>(
			`${customerId}-prorate-immediately`,
		);
		const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

		// Downgrade to 10 units
		await autumnV1.subscriptionUpdate({
			customer_id: `${customerId}-prorate-immediately`,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * billingUnits,
				},
			],
		});

		const afterUpdate = await autumnV1.customers.get<ApiCustomer>(
			`${customerId}-prorate-immediately`,
		);

		// Should create invoice with credit
		expect(afterUpdate.invoices?.length).toBeGreaterThan(invoiceCountBefore);

		const latestInvoice = afterUpdate.invoices?.[0];
		expect(latestInvoice?.status).toBe("paid");

		// Should have negative total (credit) - prorated amount
		expect(latestInvoice?.total).toBeLessThan(0);

		// Balance should be reduced
		const balance = afterUpdate.balances?.[TestFeature.Messages];
		expect(balance?.purchased_balance).toBe(10 * billingUnits);
	});

	test("OnDecrease.NoProrations - should not give any credit", async () => {
		const product = createProductWithProrationConfig(
			"downgrade_no_prorations",
			OnDecrease.NoProrations,
		);

		await initCustomerV3({
			ctx,
			customerId: `${customerId}-no-prorations`,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [product],
			prefix: customerId,
		});

		await autumnV1.attach({
			customer_id: `${customerId}-no-prorations`,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20 * billingUnits,
				},
			],
		});

		const beforeInvoices = await autumnV1.customers.get<ApiCustomer>(
			`${customerId}-no-prorations`,
		);
		const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

		// Downgrade to 10 units
		await autumnV1.subscriptionUpdate({
			customer_id: `${customerId}-no-prorations`,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * billingUnits,
				},
			],
		});

		const afterUpdate = await autumnV1.customers.get<ApiCustomer>(
			`${customerId}-no-prorations`,
		);

		// Should NOT create invoice (no credit)
		expect(afterUpdate.invoices?.length).toBe(invoiceCountBefore);

		// Balance should be reduced immediately (no credit, but balance updated)
		const balance = afterUpdate.balances?.[TestFeature.Messages];
		expect(balance?.purchased_balance).toBe(10 * billingUnits);
	});
});
