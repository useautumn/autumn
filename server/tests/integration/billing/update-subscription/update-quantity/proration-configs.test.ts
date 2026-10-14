import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";

const billingUnits = 12;
const pricePerUnit = 8;

test.concurrent(`${chalk.yellowBright("update-quantity: prorate immediately on upgrade")}`, async () => {
	const customerId = "proration-upgrade-prorate-immediately";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const fullAmount = 10 * pricePerUnit;
	expect(preview.total).toBeGreaterThan(0);
	expect(preview.total).toBeLessThanOrEqual(fullAmount);

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore + 1,
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("update-quantity: prorate next cycle on upgrade")}`, async () => {
	const customerId = "proration-upgrade-prorate-next";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
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

	const { autumnV1, testClockId } = await initScenario({
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
			s.advanceTestClock({ days: 15 }),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	expect(preview.total).toBe(0);

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const finalizedInvoices = afterUpdate.invoices?.filter(
		(inv) => inv.status === "paid" || inv.status === "open",
	);
	expect(finalizedInvoices?.length).toBe(invoiceCountBefore);

	const feature = afterUpdate.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(20 * billingUnits);

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addHours(
			addMonths(new Date(), 1),
			hoursToFinalizeInvoice,
		).getTime(),
		waitForSeconds: 30,
	});

	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: invoiceCountBefore + 1,
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("update-quantity: bill next cycle on upgrade")}`, async () => {
	const customerId = "proration-upgrade-bill-next";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
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

	const { autumnV1, testClockId } = await initScenario({
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
			s.advanceTestClock({ days: 15 }),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	expect(preview.total).toBe(0);

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(afterUpdate.invoices?.length).toBe(invoiceCountBefore);

	const feature = afterUpdate.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(20 * billingUnits);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const fullRenewalAmount = 20 * pricePerUnit;
	expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: (beforeInvoices.invoices?.length ?? 0) + 1,
		latestTotal: fullRenewalAmount,
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("update-quantity: prorate immediately on downgrade")}`, async () => {
	const customerId = "proration-downgrade-prorate-immed";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	expect(preview.total).toBeLessThan(0);

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore + 1,
		latestTotal: preview.total,
		latestStatus: "paid",
	});

	const feature = afterUpdate.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(10 * billingUnits);
});

test.concurrent(`${chalk.yellowBright("update-quantity: no prorations on downgrade")}`, async () => {
	const customerId = "proration-downgrade-no-prorations";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
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

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	expect(preview.total).toBe(0);

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore,
	});

	const feature = afterUpdate.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(20 * billingUnits);
});
