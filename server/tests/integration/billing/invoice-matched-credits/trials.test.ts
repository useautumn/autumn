/**
 * Invoice-Matched Proration Credits — Trial Tests
 *
 * Verifies correct credit behavior when trials interact with the
 * invoice-matched credit system:
 *
 * - Upgrade during trial: no credit (no stored charge for a $0 trial)
 * - Paid product switched to trial sibling: paid product credited from stored charge
 * - End trial: no refund-direction line items emitted
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade during trial — no credit (trial product has no stored charge)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits trial 1: upgrade during trial — no credit for outgoing trial product")}`,
	async () => {
		const customerId = "imc-trial-upgrade";

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [items.monthlyMessages({ includedUsage: 500 })],
			trialDays: 14,
			cardRequired: false,
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial, premium] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		const customerTrialing =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerTrialing,
			active: [proTrial.id],
		});

		await expectCustomerInvoiceCorrect({
			customer: customerTrialing,
			count: 1,
			latestTotal: 0,
		});

		const preview = await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(preview.total).toBe(50);

		const creditLines = preview.line_items.filter((li: { total: number }) => li.total < 0);
		expect(creditLines.length).toBe(0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		const customerAfterUpgrade =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterUpgrade,
			active: [premium.id],
			notPresent: [proTrial.id],
		});

		await expectProductNotTrialing({
			customer: customerAfterUpgrade,
			productId: premium.id,
			nowMs: advancedTo,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerAfterUpgrade,
			count: 2,
			latestTotal: 50,
		});
	},
	300_000,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Paid product switched to trial sibling — sibling credited from stored charge
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits trial 2: paid product switched to trial — credit from stored charge")}`,
	async () => {
		const customerId = "imc-trial-sibling";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premiumTrial = products.premiumWithTrial({
			id: "premium-trial",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			trialDays: 14,
			cardRequired: true,
		});

		const { autumnV1, autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premiumTrial] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 20,
		});

		const preview = await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `premium-trial_${customerId}`,
		});

		expect(preview.total).toBe(-20);

		const creditLines = preview.line_items.filter((li: { total: number }) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum: number, li: { total: number }) => sum + li.total, 0);
		expect(creditTotal).toBe(-20);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premiumTrial.id,
		});

		await new Promise((resolve) => setTimeout(resolve, 4000));

		const customerAfterSwitch =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterSwitch,
			active: [premiumTrial.id],
			notPresent: [pro.id],
		});

		await expectProductTrialing({
			customer: customerAfterSwitch,
			productId: premiumTrial.id,
			trialEndsAt: advancedTo + 14 * 24 * 60 * 60 * 1000,
		});
	},
	300_000,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: End trial — no refund lines emitted
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits trial 3: end trial — no refund-direction line items")}`,
	async () => {
		const customerId = "imc-trial-end";

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [items.monthlyMessages({ includedUsage: 500 })],
			trialDays: 7,
			cardRequired: true,
		});

		const { autumnV1, autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		const customerTrialing =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductTrialing({
			customer: customerTrialing,
			productId: proTrial.id,
			trialEndsAt: advancedTo + 7 * 24 * 60 * 60 * 1000,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerTrialing,
			count: 1,
			latestTotal: 0,
		});

		const previewBeforeTrialEnd = await autumnV2_2.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: proTrial.id,
			recalculate_balances: { enabled: true },
		});

		const refundLines = previewBeforeTrialEnd.line_items.filter(
			(li: { total: number }) => li.total < 0,
		);
		expect(refundLines.length).toBe(0);

		const nextCyclePreview = expectPreviewNextCycleCorrect({
			preview: previewBeforeTrialEnd,
			expectDefined: true,
		})!;

		const nextCycleRefundLines = nextCyclePreview.line_items.filter(
			(li) => li.total < 0,
		);
		expect(nextCycleRefundLines.length).toBe(0);

		expect(nextCyclePreview.total).toBeGreaterThanOrEqual(0);
	},
	300_000,
);
