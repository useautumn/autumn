import { expect, test } from "bun:test";
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

// Contract: reset invoices use old recurring refunds and full new quantities; identity, usage policy,
// one-off state, unrelated pending quantities and renewal timing survive. Before implementation, the quantity/anchor guard rejects.
const cases = [
	{ name: "increase", old: 300, next: 500 },
	{ name: "decrease", old: 500, next: 300 },
	{ name: "deferred-decrease", old: 500, next: 300, deferred: true },
	{ name: "volume", old: 300, next: 800, volume: true },
	{ name: "none-increase", old: 300, next: 500, none: true },
	{
		name: "none-deferred-decrease",
		old: 500,
		next: 300,
		deferred: true,
		none: true,
	},
	{ name: "mixed-one-off", old: 300, next: 500, oneOff: true },
	{ name: "reset-usage", old: 300, next: 500, resetUsage: true },
];
for (const variant of cases) {
	test.concurrent(`anchor quantities: ${variant.name}`, async () => {
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
		const expectedTotal = variant.none
			? newAmount
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
		expect(preview.line_items).toHaveLength(variant.none ? 2 : 4);
		const charges = preview.line_items
			.filter((line) => line.total > 0)
			.map((line) => line.total)
			.sort((a, b) => a - b);
		expect(charges).toEqual([20, newAmount - 20].sort((a, b) => a - b));
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
	});
}

test.concurrent(
	"anchor quantities: preserve unrelated pending decrease",
	async () => {
		const customerId = "anchor-qty-pending";
		const scenario = await setupAnchorQuantityScenario({
			customerId,
			quantity: 500,
			prepaidItem: items.prepaidMessages({
				prorationConfig: { onDecrease: OnDecrease.NoProrations },
			}),
			extraItems: [
				items.prepaid({
					featureId: "words",
					prorationConfig: { onDecrease: OnDecrease.NoProrations },
				}),
			],
			extraQuantities: [{ feature_id: "words", quantity: 500 }],
		});
		const { autumnV2_4, target, ctx, advancedTo } = scenario;
		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			...target,
			feature_quantities: [
				{ feature_id: "messages", quantity: 200 },
				{ feature_id: "words", quantity: 200 },
			],
		});
		const before = await scenario.readProduct();
		const pendingWords = before.options.find(
			(option) => option.feature_id === "words",
		);
		expect(pendingWords).toMatchObject({ quantity: 5, upcoming_quantity: 2 });
		expect(
			before.options.find((option) => option.feature_id === "messages"),
		).toMatchObject({ quantity: 5, upcoming_quantity: 2 });
		const params: UpdateSubscriptionV1ParamsInput = {
			...target,
			feature_quantities: [{ feature_id: "messages", quantity: 300 }],
			billing_cycle_anchor: "now",
		};
		const preview =
			await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expect(await scenario.readProduct()).toEqual(before);
		const expectedTotal = await calculateResetBillingCycleNowTotal({
			customerId,
			advancedTo,
			oldAmount: 120,
			newAmount: 100,
		});
		expect(preview.total).toBeCloseTo(expectedTotal, 2);
		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>(params);
		const { product } = await expectAnchorQuantityIdentity({
			scenario,
			anchorMs: advancedTo,
		});
		expect(
			product.options.find((option) => option.feature_id === "words"),
		).toEqual(pendingWords);
		const messages = product.options.find(
			(option) => option.feature_id === "messages",
		);
		expect(messages?.quantity).toBe(3);
		expect(messages?.upcoming_quantity == null).toBe(true);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedTotal,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
