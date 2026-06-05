import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const BILLING_UNITS = 12;
const PRICE_PER_UNIT = 8;

test.concurrent(
	`${chalk.yellowBright("invoice-matched qty 1: prepaid quantity decrease — credit from stored charge")}`,
	async () => {
		const customerId = "inv-match-qty-decrease";

		const product = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits: BILLING_UNITS,
					price: PRICE_PER_UNIT,
				}),
			],
		});

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 20 * BILLING_UNITS },
					],
				}),
			],
		});

		// Advance a full cycle (clean renewal charge stored) then mid-cycle.
		let advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			numberOfMonths: 1,
			waitForSeconds: 30,
		});
		advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			startingFrom: new Date(advancedTo),
			numberOfDays: 15,
			waitForSeconds: 20,
		});

		const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
		);
		const invoiceCountBefore = customerBefore.invoices?.length ?? 0;

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 5 * BILLING_UNITS }],
		});

		// Decreasing units mid-cycle yields a prorated credit.
		expect(preview.total).toBeLessThan(0);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 5 * BILLING_UNITS }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(
			5 * BILLING_UNITS,
		);

		// Preview must match what was actually invoiced (credit sourced from the
		// stored renewal charge, not catalog re-synthesis).
		expect(customer.invoices?.length ?? 0).toBe(invoiceCountBefore + 1);
		const latestInvoice = customer.invoices?.[0];
		expect(latestInvoice).toBeDefined();
		expect(Math.abs(latestInvoice!.total - preview.total)).toBeLessThanOrEqual(
			0.01,
		);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched qty 2: prepaid decrease after mid-cycle increase — nets across stored charges")}`,
	async () => {
		const customerId = "inv-match-qty-netting";

		const product = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits: BILLING_UNITS,
					price: PRICE_PER_UNIT,
				}),
			],
		});

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * BILLING_UNITS },
					],
				}),
			],
		});

		// Renew so there is a full-period stored charge for the current cycle.
		let advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			numberOfMonths: 1,
			waitForSeconds: 30,
		});

		// Mid-cycle increase: creates a SECOND stored charge row for this price.
		advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			startingFrom: new Date(advancedTo),
			numberOfDays: 10,
			waitForSeconds: 20,
		});
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * BILLING_UNITS },
			],
		});

		advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			startingFrom: new Date(advancedTo),
			numberOfDays: 10,
			waitForSeconds: 20,
		});

		const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
		);
		const invoiceCountBefore = customerBefore.invoices?.length ?? 0;

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 5 * BILLING_UNITS }],
		});

		expect(preview.total).toBeLessThan(0);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 5 * BILLING_UNITS }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(
			5 * BILLING_UNITS,
		);

		// The credit must net both stored charge rows (renewal + mid-cycle increase);
		// with single-row crediting this preview/execute parity would break.
		expect(customer.invoices?.length ?? 0).toBe(invoiceCountBefore + 1);
		const latestInvoice = customer.invoices?.[0];
		expect(latestInvoice).toBeDefined();
		expect(Math.abs(latestInvoice!.total - preview.total)).toBeLessThanOrEqual(
			0.01,
		);
	},
	300_000,
);
