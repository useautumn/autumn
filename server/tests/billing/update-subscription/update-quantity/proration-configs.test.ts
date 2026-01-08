import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	initScenario,
	s,
} from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";

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

// =============================================================================
// UPGRADE PRORATION TESTS
// =============================================================================

test.concurrent(
	`${chalk.yellowBright("update-quantity: prorate immediately on upgrade")}`,
	async () => {
		const customerId = "proration-upgrade-prorate-immed";

		const product = constructRawProduct({
			id: "prepaid",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
					config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.ProrateImmediately,
					},
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});

		const beforeInvoices =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

		// Upgrade to 20 units
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
		});

		const afterUpdate =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Should create invoice
		expect(afterUpdate.invoices?.length).toBeGreaterThan(invoiceCountBefore);

		const latestInvoice = afterUpdate.invoices?.[0];
		expect(latestInvoice?.status).toBe("paid");

		// Should charge PRORATED amount (less than full $80)
		// Exact amount depends on time remaining in billing cycle
		const fullAmount = 10 * pricePerUnit;
		expect(latestInvoice?.total).toBeGreaterThan(0);
		expect(latestInvoice?.total).toBeLessThanOrEqual(fullAmount);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: prorate next cycle on upgrade")}`,
	async () => {
		const customerId = "proration-upgrade-prorate-next";

		const product = constructRawProduct({
			id: "prepaid",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
					config: {
						on_increase: OnIncrease.ProrateNextCycle,
						on_decrease: OnDecrease.ProrateImmediately,
					},
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});

		const beforeInvoices =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

		// Upgrade to 20 units
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
		});

		const afterUpdate =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Should NOT create finalized invoice immediately
		const finalizedInvoices = afterUpdate.invoices?.filter(
			(inv) => inv.status === "paid" || inv.status === "open",
		);
		expect(finalizedInvoices?.length).toBe(invoiceCountBefore);

		// But balance should be updated immediately
		const feature = afterUpdate.features?.[TestFeature.Messages];
		expect(feature?.balance).toBe(20 * billingUnits);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: bill next cycle on upgrade")}`,
	async () => {
		const customerId = "proration-upgrade-bill-next";

		const product = constructRawProduct({
			id: "prepaid",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
					config: {
						on_increase: OnIncrease.BillNextCycle,
						on_decrease: OnDecrease.ProrateImmediately,
					},
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});

		const beforeInvoices =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

		// Upgrade to 20 units
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
		});

		const afterUpdate =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Should NOT create invoice immediately
		expect(afterUpdate.invoices?.length).toBe(invoiceCountBefore);

		// But balance should be updated
		const feature = afterUpdate.features?.[TestFeature.Messages];
		expect(feature?.balance).toBe(20 * billingUnits);
	},
);

// =============================================================================
// DOWNGRADE PRORATION TESTS
// =============================================================================

test.concurrent(
	`${chalk.yellowBright("update-quantity: prorate immediately on downgrade")}`,
	async () => {
		const customerId = "proration-downgrade-prorate-immed";

		const product = constructRawProduct({
			id: "prepaid",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
					config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.ProrateImmediately,
					},
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
					],
				}),
			],
		});

		const beforeInvoices =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

		// Downgrade to 10 units
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		const afterUpdate =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Should create invoice with credit
		expect(afterUpdate.invoices?.length).toBeGreaterThan(invoiceCountBefore);

		const latestInvoice = afterUpdate.invoices?.[0];
		expect(latestInvoice?.status).toBe("paid");

		// Should have negative total (credit) - prorated amount
		expect(latestInvoice?.total).toBeLessThan(0);

		// Balance should be reduced
		const feature = afterUpdate.features?.[TestFeature.Messages];
		expect(feature?.balance).toBe(10 * billingUnits);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: no prorations on downgrade")}`,
	async () => {
		const customerId = "proration-downgrade-no-prorations";

		const product = constructRawProduct({
			id: "prepaid",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
					config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.NoProrations,
					},
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
					],
				}),
			],
		});

		const beforeInvoices =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

		// Downgrade to 10 units
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		const afterUpdate =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Should NOT create invoice (no credit)
		expect(afterUpdate.invoices?.length).toBe(invoiceCountBefore);

		// Balance should be reduced immediately (no credit, but balance updated)
		const feature = afterUpdate.features?.[TestFeature.Messages];
		expect(feature?.balance).toBe(10 * billingUnits);
	},
);
