import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Catalog fallback when no stored row exists
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched edge 1: catalog fallback when no stored row exists")}`,
	async () => {
		const customerId = "inv-match-edge-fallback";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const upgradeResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		expect(upgradeResult).toBeDefined();

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
		});
	},
	300_000,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Multi-attach with outgoing credit
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched edge 2: multi-attach with outgoing credit from stored charge")}`,
	async () => {
		const customerId = "inv-match-edge-multi";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 200 })],
		});

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium, addon] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ months: 1 }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoiceCountBefore = customerBefore.invoices?.length ?? 0;

		const preview = await autumnV1.billing.previewMultiAttach({
			customer_id: customerId,
			plans: [{ plan_id: premium.id }, { plan_id: addon.id }],
		});

		expect(preview.total).toBeDefined();
		expect(preview.outgoing.length).toBeGreaterThanOrEqual(1);

		const outgoingPro = preview.outgoing.find((c: { plan_id: string }) => c.plan_id === pro.id);
		expect(outgoingPro).toBeDefined();

		await autumnV1.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: premium.id }, { plan_id: addon.id }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id, addon.id],
			notPresent: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			includedUsage: 200,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: invoiceCountBefore + 1,
		});

		const latestInvoice = customer.invoices?.[0];
		expect(latestInvoice).toBeDefined();
		expect(latestInvoice!.total).toBeDefined();

		expect(latestInvoice!.total).toBeLessThan(70);
	},
	300_000,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: No-op re-attach — filterUnchangedPrices cancels
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched edge 3: no-op re-attach — filterUnchangedPrices cancels")}`,
	async () => {
		const customerId = "inv-match-edge-noop";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ months: 1 }),
			],
		});

		await expectProductActive({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			productId: pro.id,
		});

		let threw = false;
		try {
			await autumnV1.billing.previewAttach({
				customer_id: customerId,
				product_id: pro.id,
			});
		} catch (err: any) {
			threw = true;
			expect(err.code).toBe("plan_already_attached");
		}
		expect(threw).toBe(true);
	},
	300_000,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Preview/execute rounding parity on upgrade
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched edge 4: preview/execute rounding parity on mid-cycle upgrade")}`,
	async () => {
		const customerId = "inv-match-edge-rounding";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ months: 1 }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoiceCountBefore = customerBefore.invoices?.length ?? 0;

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});

		expect(preview.total).toBeDefined();
		expect(preview.total).toBeGreaterThan(0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: invoiceCountBefore + 1,
		});

		const latestInvoice = customer.invoices?.[0];
		expect(latestInvoice).toBeDefined();
		expect(latestInvoice!.total).toBeCloseTo(preview.total, 0);

		const diff = Math.abs(latestInvoice!.total - preview.total);
		expect(diff).toBeLessThanOrEqual(0.01);
	},
	300_000,
);
