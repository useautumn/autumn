/** multiUpdate billing action: cancel multiple plans in one call. All updates fold into ONE
 * billing plan: one Stripe evaluation per subscription, one combined proration invoice. */

import { test } from "bun:test";
import type { ApiCustomerV5, MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel ALL plans immediately in one call — whole-sub cancel + preview parity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro A (group a, $20/mo) + Pro B (group b, $20/mo) on one subscription
 * - previewMultiUpdate both cancels, then multiUpdate with the same params
 *
 * Expected Result:
 * - Preview total = combined prorated credit for both plans (negative)
 * - Execution: both plans removed, Stripe subscription canceled entirely,
 *   ONE credit invoice whose total matches the preview exactly and whose
 *   product_ids cover BOTH plans
 */
test.concurrent(
	`${chalk.yellowBright("multi update basic: cancel all plans immediately, whole sub canceled, preview parity")}`,
	async () => {
		const customerId = "multi-update-basic-imm-all";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const proB = products.pro({
			id: "pro-b",
			items: [items.monthlyUsers({ includedUsage: 5 })],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, proB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: proB.id }),
			],
		});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "cancel_immediately" },
				{ plan_id: proB.id, cancel_action: "cancel_immediately" },
			],
		};

		// ── Contract: preview = exact combined credit; nothing renews next cycle ─
		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: -40,
			subscriptions: [
				{ planIds: [proA.id, proB.id], total: -40, nextCycleTotal: null },
			],
		});

		// ── Contract: execution matches preview, one credit invoice ──────────────
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proA.id, proB.id],
		});

		// Attach invoices (2) + single combined credit invoice (1) carrying BOTH plans
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: preview.total,
			latestInvoiceProductIds: [proA.id, proB.id],
		});

		// ── Contract: whole-sub Stripe cancel when nothing survives ──────────────
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: proration_behavior "none" on both cancels — no new invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro A + Pro B attached (2 attach invoices)
 * - ONE multiUpdate: cancel both immediately with proration_behavior: "none"
 *
 * Expected Result:
 * - Both plans removed, subscription canceled, NO credit invoice created
 */
test.concurrent(
	`${chalk.yellowBright("multi update basic: proration none, cancel immediately creates no invoice")}`,
	async () => {
		const customerId = "multi-update-basic-proration-none";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const proB = products.pro({
			id: "pro-b",
			items: [items.monthlyUsers({ includedUsage: 5 })],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, proB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: proB.id }),
			],
		});

		// Sanity: both plans active, 2 attach invoices
		const customerBeforeCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({
			customer: customerBeforeCancel,
			productId: proA.id,
		});
		await expectCustomerInvoiceCorrect({ customerId, count: 2 });

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					plan_id: proA.id,
					cancel_action: "cancel_immediately",
					proration_behavior: "none",
				},
				{
					plan_id: proB.id,
					cancel_action: "cancel_immediately",
					proration_behavior: "none",
				},
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proA.id, proB.id],
		});

		// ── Contract: no charge artifacts when proration is none ─────────────────
		await expectCustomerInvoiceCorrect({ customerId, count: 2 });

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
