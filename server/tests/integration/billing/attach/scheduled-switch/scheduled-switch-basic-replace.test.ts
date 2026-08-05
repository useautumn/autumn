/**
 * Scheduled Switch Basic — Replacement Tests (Attach V2), slice 1
 *
 * Split out of scheduled-switch-basic.test.ts. Covers a scheduled downgrade
 * being REPLACED by a second downgrade before the cycle ends.
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
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectEventually } from "./utils/expectEventually";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Premium to Pro (scheduled) to Free (replaces scheduled)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro (scheduled)
 * - Downgrade to free (replaces scheduled pro)
 *
 * Expected Result:
 * - Scheduled pro is replaced by free
 * - After cycle: premium removed, free active
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 3a: premium to pro to free (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-premium-pro-free-a";

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

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: pro.id }), // Schedule downgrade to pro
			],
		});

		// Verify Stripe subscription after premium attach and pro scheduled
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Verify pro is scheduled
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerBefore,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: customerBefore,
			productId: pro.id,
		});

		// Preview downgrade to free - should be $0 (scheduled, not immediate)
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: free.id,
		});
		expect(preview.total).toBe(0);

		// Downgrade to free (should replace scheduled pro)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		const customerAfterReplace =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Premium still canceling
		await expectProductCanceling({
			customer: customerAfterReplace,
			productId: premium.id,
		});

		// Pro replaced by free (pro should be removed, free scheduled)
		await expectProductNotPresent({
			customer: customerAfterReplace,
			productId: pro.id,
		});
		await expectProductScheduled({
			customer: customerAfterReplace,
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
	`${chalk.yellowBright("scheduled-switch-basic 3b: premium to pro to free (after cycle)")}`,
	async () => {
		const customerId = "sched-switch-premium-pro-free-b";

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
				s.billing.attach({ productId: pro.id }), // Schedule downgrade to pro
				s.billing.attach({ productId: free.id }), // Replace with free
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		// After cycle: premium removed, free active. Webhook-driven, so poll.
		await expectCustomerProducts({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [free.id],
			notPresent: [premium.id, pro.id],
		});

		// Features updated to free tier
		await expectCustomerFeatureCorrect({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Invoice: only premium ($50), free has no renewal charge
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 1,
			latestTotal: 50,
		});

		// After downgrading to free, there should be no Stripe subscription
		await expectEventually(() =>
			expectNoStripeSubscription({
				db: ctxAfter.db,
				customerId,
				org: ctxAfter.org,
				env: ctxAfter.env,
			}),
		);
	},
);
