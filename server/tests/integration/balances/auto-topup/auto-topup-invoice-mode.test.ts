import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { autoTopupLimitRepo } from "@/internal/balances/autoTopUp/repos";
import { makeAutoTopupConfig } from "./utils/makeAutoTopupConfig.js";

const AUTO_TOPUP_WAIT_MS = 20000;

test.concurrent(`${chalk.yellowBright("auto-topup invoice-mode: creates open invoice and tops up balance")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-im1",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-im1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			invoiceMode: true,
		}),
	});

	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(before.balances[TestFeature.Messages].remaining).toBe(100);

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedBalance = new Decimal(100).sub(85).add(100).toNumber();
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: expectedBalance,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "open",
		latestInvoiceProductId: oneOffProd.id,
	});

	const invoices = after.invoices ?? [];
	const latestInvoice = invoices[0];
	expect(latestInvoice.status).not.toBe("void");
});

test.concurrent(`${chalk.yellowBright("auto-topup invoice-mode: disabled invoice_mode charges card normally")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-im2",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "auto-topup-im2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			invoiceMode: false,
		}),
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedBalance = new Decimal(100).sub(85).add(100).toNumber();
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: expectedBalance,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "paid",
		latestInvoiceProductId: oneOffProd.id,
	});
});

test.concurrent(`${chalk.yellowBright("auto-topup invoice-mode: multiple sequential top-ups record as successes")}`, async () => {
	const oneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffProd = products.oneOffAddOn({
		id: "topup-im3",
		items: [oneOffItem],
	});

	const { customerId, autumnV2_1, ctx, customer } = await initScenario({
		customerId: "auto-topup-im3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: oneOffProd.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: 20,
			quantity: 100,
			invoiceMode: true,
		}),
	});

	// Round 1: Track 85 → balance = 15 → top-up fires → balance = 115
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 85,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedMid = new Decimal(100).sub(85).add(100).toNumber();
	expectBalanceCorrect({
		customer: mid,
		featureId: TestFeature.Messages,
		remaining: expectedMid,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 10,
		latestStatus: "open",
		latestInvoiceProductId: oneOffProd.id,
	});

	// Round 2: Track 100 → balance = 15 → second top-up fires → balance = 115
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedAfter = new Decimal(115).sub(100).add(100).toNumber();
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: expectedAfter,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: 10,
		latestStatus: "open",
		latestInvoiceProductId: oneOffProd.id,
	});

	// Verify limit state recorded both as successes, not failures
	expect(Boolean(customer?.internal_id)).toBe(true);
	const limitState = await autoTopupLimitRepo.findByScope({
		ctx,
		internalCustomerId: customer?.internal_id || "",
		featureId: TestFeature.Messages,
	});

	expect(limitState).toBeDefined();
	expect(limitState?.attempt_count).toBe(2);
	expect(limitState?.failed_attempt_count).toBe(0);
});
