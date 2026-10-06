import { expect } from "bun:test";
import type { BillingPreviewResponse } from "@autumn/shared";
import {
	OnDecrease,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { calculateResetBillingCycleNowTotal } from "@tests/integration/billing/utils/proration/index.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { addDays, addMonths } from "date-fns";
import {
	expectAnchorQuantityIdentity,
	setupAnchorQuantityScenario,
} from "./setupAnchorQuantityScenario.js";

export type AnchorQuantityVariant = {
	name: string;
	old: number;
	next: number;
	deferred?: boolean;
	volume?: boolean;
	none?: boolean;
	oneOff?: boolean;
	resetUsage?: boolean;
};

// Contract: reset invoices use old recurring refunds and full new quantities; identity, usage policy,
// one-off state, unrelated pending quantities and renewal timing survive. Before implementation, the quantity/anchor guard rejects.
export const expectAnchorQuantityReset = async (
	variant: AnchorQuantityVariant,
) => {
	const customerId = `anchor-qty-${variant.name}`;
	const scenario = await setupAnchorQuantityScenario({
		customerId,
		quantity: variant.old,
		prepaidItem: variant.volume
			? items.volumePrepaidMessages()
			: items.prepaidMessages({
					prorationConfig: {
						onDecrease: variant.deferred
							? OnDecrease.NoProrations
							: OnDecrease.Prorate,
					},
				}),
		extraItems: variant.oneOff
			? [
					items.oneOffMessages({ price: 7 }),
					items.oneOffWords({ includedUsage: 100 }),
				]
			: [],
	});
	const { autumnV2_4, ctx, advancedTo, target } = scenario;
	await autumnV2_4.track(
		{ customer_id: customerId, feature_id: "messages", value: 40 },
		{ timeout: 2000 },
	);
	const before = await scenario.readProduct();
	const oldAmount = 20 + (variant.old / 100) * 10;
	const newAmount = 20 + (variant.next / 100) * (variant.volume ? 5 : 10);
	// Under none, like Stripe, only the changed prepaid item is charged a new period; the kept $20 base isn't.
	const changedItemAmount = newAmount - 20;
	const expectedTotal = variant.none
		? changedItemAmount
		: await calculateResetBillingCycleNowTotal({
				customerId,
				advancedTo,
				oldAmount,
				newAmount,
			});
	const params: UpdateSubscriptionV1ParamsInput = {
		...target,
		feature_quantities: [{ feature_id: "messages", quantity: variant.next }],
		billing_cycle_anchor: "now",
		...(variant.none ? { proration_behavior: "none" as const } : {}),
		...(variant.resetUsage ? { carry_over_usages: { enabled: false } } : {}),
	};
	const preview: BillingPreviewResponse =
		await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBeCloseTo(expectedTotal, 2);
	expect(preview.line_items).toHaveLength(variant.none ? 1 : 4);
	const charges = preview.line_items
		.filter((line) => line.total > 0)
		.map((line) => line.total)
		.sort((a, b) => a - b);
	expect(charges).toEqual(
		variant.none
			? [changedItemAmount]
			: [20, changedItemAmount].sort((a, b) => a - b),
	);
	expect(await scenario.readProduct()).toEqual(before);
	expect(
		await ctx.stripeCli.subscriptions.retrieve(scenario.subscription.id),
	).toEqual(scenario.subscription);
	await expectCustomerInvoiceCorrect({ customerId, count: 1 });

	await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>(params);
	const { product } = await expectAnchorQuantityIdentity({
		scenario,
		anchorMs: advancedTo,
	});
	const option = product.options.find(
		(candidate) => candidate.feature_id === "messages",
	);
	expect(option?.quantity).toBe(variant.next / 100);
	expect(option?.upcoming_quantity == null).toBe(true);
	expect(product.billing_cycle_anchor_resets_at).toBeNull();
	const recurringEntitlement = product.customer_entitlements.find(
		(candidate) => candidate.entitlement.interval === "month",
	);
	expect(recurringEntitlement?.next_reset_at).toBe(
		addMonths(advancedTo, 1).getTime(),
	);
	if (variant.oneOff) {
		expect(
			product.customer_entitlements.filter(
				(candidate) => candidate.entitlement.interval === null,
			),
		).toEqual(
			before.customer_entitlements.filter(
				(candidate) => candidate.entitlement.interval === null,
			),
		);
	} else {
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: "messages",
			remaining: variant.next - (variant.resetUsage ? 0 : 40),
			usage: variant.resetUsage ? 0 : 40,
			nextResetAt: addMonths(advancedTo, 1).getTime(),
		});
	}
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: expectedTotal,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	if (variant.name === "increase") {
		const oldEnd =
			scenario.subscription.items.data[0].current_period_end * 1000;
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: scenario.testClockId!,
			advanceTo: addDays(oldEnd, 1).getTime(),
		});
		await expectCustomerInvoiceCorrect({ customerId, count: 2 });
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: scenario.testClockId!,
			advanceTo: addDays(addMonths(advancedTo, 1), 1).getTime(),
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: newAmount,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: "messages",
			remaining: variant.next,
			usage: 0,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	}
};
