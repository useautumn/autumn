/**
 * remove_plan_ids - Separate Subscription Tests
 *
 * With no same-group plan to replace, attach used to merge into whichever paid
 * subscription ranked first for the customer. Among equally ranked plans that
 * is the OLDEST one, so a customer whose other plan (here "transactional") was
 * attached before the plan being swapped out had the attach land on the wrong
 * subscription. When the plan named in
 * remove_plan_ids was billed on a DIFFERENT subscription, the attach was
 * rejected ("billed on a separate subscription and cannot be removed"), even
 * though the caller's intent is plainly to swap that plan for the new one.
 *
 * The removed plan's subscription is now the attach's target, so the new plan
 * takes over the removed plan's Stripe subscription and the other subscription
 * is left alone.
 *
 * Key behaviors:
 * - The attached plan lands on the removed plan's subscription.
 * - The other subscription (and its plan) is untouched.
 * - A plan that shares the removed plan's subscription stays on it.
 * - Removing two paid plans on different subscriptions is still rejected.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	BillingInterval,
	ErrCode,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const marketingPlan = () =>
	products.base({
		id: "marketing",
		group: "marketing",
		items: [
			items.monthlyPrice({ price: 30 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});

const transactionalPlan = () =>
	products.base({
		id: "transactional",
		group: "transactional",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyWords({ includedUsage: 100 }),
		],
	});

const enterprisePlan = () =>
	products.base({
		id: "enterprise",
		group: "enterprise",
		items: [
			items.monthlyPrice({ price: 50 }),
			items.monthlyMessages({ includedUsage: 500 }),
		],
	});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attached plan takes over the removed plan's subscription
//
// Transactional ($20/mo) on sub A, then Marketing ($30/mo) on sub B (new sub).
// Advance 15 days. Attach Enterprise ($50/mo, its own group) with
// remove_plan_ids: [marketing].
// Expected: Enterprise on sub B, Transactional still on sub A, 2 subs total,
// invoice = ($50 - $30) x remaining ratio.
// Before the fix: 400 "billed on a separate subscription".
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("remove-plan-ids separate sub 1: attached plan takes over the removed plan's subscription")}`,
	async () => {
		const customerId = "remove-plan-ids-separate-sub-1";
		const marketing = marketingPlan();
		const transactional = transactionalPlan();
		const enterprise = enterprisePlan();

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [marketing, transactional, enterprise] }),
			],
			actions: [
				s.billing.attach({ productId: transactional.id }),
				s.billing.attach({
					productId: marketing.id,
					newBillingSubscription: true,
				}),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const marketingSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: marketing.id,
		});
		const transactionalSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: transactional.id,
		});
		expect(marketingSubId).not.toBe(transactionalSubId);

		const expectedTotal = await calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: 30,
			newAmount: 50,
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: enterprise.id,
			remove_plan_ids: [marketing.id],
		});
		expect(preview.total).toBeCloseTo(expectedTotal, 0);

		const marketingCredit = preview.line_items?.find(
			(lineItem: { plan_id: string; total: number }) =>
				lineItem.plan_id === marketing.id,
		);
		expect(marketingCredit?.total).toBeLessThan(0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: enterprise.id,
			remove_plan_ids: [marketing.id],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [enterprise.id, transactional.id],
			notPresent: [marketing.id],
		});

		expect(
			await getSubscriptionId({ ctx, customerId, productId: enterprise.id }),
		).toBe(marketingSubId);
		expect(
			await getSubscriptionId({
				ctx,
				customerId,
				productId: transactional.id,
			}),
		).toBe(transactionalSubId);

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 2 },
		});

		// Invoices: transactional ($20), marketing ($30), then the netted switch.
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: preview.total,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Custom-priced swap with carry-over (the shape of a real support request)
//
// Same subscriptions as test 1. Attach Enterprise with a custom $80/mo price,
// carry_over_usages, prorate_immediately and remove_plan_ids: [marketing].
// Expected: Enterprise on sub B at $80, marketing's usage carried over,
// invoice = ($80 - $30) x remaining ratio.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("remove-plan-ids separate sub 2: custom price + carry-over swap onto the removed plan's subscription")}`,
	async () => {
		const customerId = "remove-plan-ids-separate-sub-2";
		const marketing = marketingPlan();
		const transactional = transactionalPlan();
		const enterprise = enterprisePlan();

		const { autumnV1, autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [marketing, transactional, enterprise] }),
			],
			actions: [
				s.billing.attach({ productId: transactional.id }),
				s.billing.attach({
					productId: marketing.id,
					newBillingSubscription: true,
				}),
				s.track({ featureId: "messages", value: 40, timeout: 2000 }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const marketingSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: marketing.id,
		});

		const expectedTotal = await calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: 30,
			newAmount: 80,
		});

		const attachParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			remove_plan_ids: [marketing.id],
			customize: { price: { amount: 80, interval: BillingInterval.Month } },
			carry_over_usages: { enabled: true },
			proration_behavior: "prorate_immediately",
			plan_schedule: "immediate",
			redirect_mode: "if_required",
		};

		const preview =
			await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(attachParams);
		expect(preview.total).toBeCloseTo(expectedTotal, 0);

		await autumnV2_2.billing.attach<AttachParamsV1Input>(attachParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [enterprise.id, transactional.id],
			notPresent: [marketing.id],
		});
		expect(customer.features.messages?.usage).toBe(40);

		expect(
			await getSubscriptionId({ ctx, customerId, productId: enterprise.id }),
		).toBe(marketingSubId);

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 2 },
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: preview.total,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: A plan sharing the removed plan's subscription stays on it
//
// Transactional ($20/mo) on sub A. Marketing ($30/mo) + recurring add-on
// ($20/mo) multi-attached together onto sub B. Attach Enterprise with
// remove_plan_ids: [marketing].
// Expected: Enterprise and the add-on both on sub B, Transactional on sub A.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("remove-plan-ids separate sub 3: a plan sharing the removed plan's subscription stays on it")}`,
	async () => {
		const customerId = "remove-plan-ids-separate-sub-3";
		const marketing = marketingPlan();
		const transactional = transactionalPlan();
		const enterprise = enterprisePlan();
		const addon = products.recurringAddOn({
			id: "marketing-addon",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [marketing, addon, transactional, enterprise] }),
			],
			actions: [s.billing.attach({ productId: transactional.id })],
		});

		await autumnV1.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: marketing.id }, { plan_id: addon.id }],
			new_billing_subscription: true,
		});

		const marketingSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: marketing.id,
		});
		const transactionalSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: transactional.id,
		});
		expect(marketingSubId).not.toBe(transactionalSubId);
		expect(
			await getSubscriptionId({ ctx, customerId, productId: addon.id }),
		).toBe(marketingSubId);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: enterprise.id,
			remove_plan_ids: [marketing.id],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [enterprise.id, addon.id, transactional.id],
			notPresent: [marketing.id],
		});

		expect(
			await getSubscriptionId({ ctx, customerId, productId: enterprise.id }),
		).toBe(marketingSubId);
		expect(
			await getSubscriptionId({ ctx, customerId, productId: addon.id }),
		).toBe(marketingSubId);
		expect(
			await getSubscriptionId({
				ctx,
				customerId,
				productId: transactional.id,
			}),
		).toBe(transactionalSubId);

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 2 },
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Removing two paid plans on different subscriptions is still rejected
//
// Only one subscription can be the attach's target, so the second removed plan
// would be expired in Autumn but left billing in Stripe.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("remove-plan-ids separate sub 4: two removed plans on different subscriptions are rejected")}`,
	async () => {
		const customerId = "remove-plan-ids-separate-sub-4";
		const marketing = marketingPlan();
		const transactional = transactionalPlan();
		const enterprise = enterprisePlan();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [marketing, transactional, enterprise] }),
			],
			actions: [
				s.billing.attach({ productId: marketing.id }),
				s.billing.attach({
					productId: transactional.id,
					newBillingSubscription: true,
				}),
			],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV1.billing.attach({
					customer_id: customerId,
					product_id: enterprise.id,
					remove_plan_ids: [marketing.id, transactional.id],
					redirect_mode: "if_required",
				}),
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [marketing.id, transactional.id],
			notPresent: [enterprise.id],
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: A scheduled swap cannot remove plans
//
// Removals expire immediately, but an end_of_cycle attach only starts the new
// plan at the end of the cycle — the customer would lose the removed plan's
// access in between, with no credit. The combination is rejected.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("remove-plan-ids separate sub 5: an end_of_cycle swap cannot remove plans")}`,
	async () => {
		const customerId = "remove-plan-ids-separate-sub-5";
		const marketing = marketingPlan();
		const transactional = transactionalPlan();
		const enterprise = enterprisePlan();

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [marketing, transactional, enterprise] }),
			],
			actions: [
				s.billing.attach({ productId: transactional.id }),
				s.billing.attach({
					productId: marketing.id,
					newBillingSubscription: true,
				}),
			],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: enterprise.id,
					remove_plan_ids: [marketing.id],
					plan_schedule: "end_of_cycle",
					redirect_mode: "if_required",
				}),
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [marketing.id, transactional.id],
			notPresent: [enterprise.id],
		});
	},
);
