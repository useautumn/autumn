/**
 * Scheduled Switch Basic — Replacement Tests (Attach V2), slice 2
 *
 * Split out of scheduled-switch-basic-replace.test.ts. Covers a scheduled
 * downgrade being REPLACED by an upgrade before the cycle ends.
 *
 * Key behaviors:
 * - Attaching another product while one is scheduled replaces the scheduled one
 * - Current product stays "canceling" throughout
 * - At cycle end: current product removed, the last scheduled product becomes active
 *
 * Each scenario is split into an "a" (mid-cycle) and "b" (after cycle) test with
 * separate customers so each test owns its own Stripe test clock.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { expectEventually } from "./utils/expectEventually";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Premium to Free (scheduled) to Pro (upgrade cancels scheduled)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to free (scheduled)
 * - Upgrade to pro ($20/mo) - immediate, should cancel scheduled downgrade
 *
 * Expected Result:
 * - Scheduled free is cancelled
 * - Pro is active immediately (downgrade from premium)
 * - Premium removed
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 4a: premium to free to pro (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-premium-free-pro-a";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [messagesItem],
		});

		const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: free.id }), // Schedule downgrade to free
			],
		});

		// Verify Stripe subscription after premium attach and free scheduled
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Verify state before upgrade
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerBefore,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: customerBefore,
			productId: free.id,
		});

		// Upgrade to pro - this should:
		// 1. Cancel the scheduled free downgrade
		// 2. Switch from premium to pro (still a downgrade since pro < premium)
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
		});
		// Downgrade from premium ($50) to pro ($20) - scheduled, no charge
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			total: 20,
			startsAt: addMonths(advancedTo, 1).getTime(),
		}); // Pro is $20/mo next cycle

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Premium still canceling, pro scheduled (replacing free)
		await expectProductCanceling({
			customer,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer,
			productId: free.id,
		});

		// Verify Stripe subscription after replacing scheduled product
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 4b: premium to free to pro (after cycle)")}`,
	async () => {
		const customerId = "sched-switch-premium-free-pro-b";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [messagesItem],
		});

		const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: free.id }), // Schedule downgrade to free
				s.billing.attach({ productId: pro.id }), // Replace with pro
				s.advanceToNextInvoice(),
			],
		});

		// After cycle: premium removed, pro active. Webhook-driven, so poll.
		await expectCustomerProducts({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id],
			notPresent: [premium.id, free.id],
		});

		// Features updated to pro tier
		await expectCustomerFeatureCorrect({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		// Invoices: premium ($50) + pro renewal ($20)
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 2,
			latestTotal: 20,
			latestInvoiceProductIds: [pro.id],
		});

		// Verify Stripe subscription after cycle
		await expectEventually(() =>
			expectSubToBeCorrect({
				db: ctxAfter.db,
				customerId,
				org: ctxAfter.org,
				env: ctxAfter.env,
			}),
		);
	},
);
