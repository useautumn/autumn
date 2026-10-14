import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateCrossIntervalUpgrade } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("immediate-switch-billing-interval 1: monthly to annual")}`, async () => {
	const customerId = "imm-switch-monthly-to-annual";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});

	const proAnnualMessages = items.monthlyMessages({ includedUsage: 500 });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proMonthly, proAnnual] }),
		],
		actions: [s.billing.attach({ productId: proMonthly.id })],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});
	expect(preview.total).toBe(180);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proAnnual.id,
	});

	await expectProductNotPresent({
		customer,
		productId: proMonthly.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 180,
	});
});

test.concurrent(`${chalk.yellowBright("immediate-switch-billing-interval 2: to annual mid-cycle")}`, async () => {
	const customerId = "imm-switch-monthly-annual-mid";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [messagesItem],
	});

	const proAnnualMessages = items.monthlyMessages({ includedUsage: 500 });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualMessages],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proMonthly, proAnnual] }),
		],
		actions: [
			s.billing.attach({ productId: proMonthly.id }),
			s.advanceTestClock({ months: 1, days: 15 }),
		],
	});

	const expectedTotal = await calculateCrossIntervalUpgrade({
		customerId,
		advancedTo,
		oldAmount: 20,
		newAmount: 200,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
		redirect_mode: "if_required",
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proAnnual.id,
	});

	await expectProductNotPresent({
		customer,
		productId: proMonthly.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: preview.total,
	});
});
