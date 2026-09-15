import { expect, test } from "bun:test";
import type { BillingPreviewResponse } from "@autumn/shared";
import {
	OnDecrease,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration/index.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { addDays, addMonths } from "date-fns";
import {
	expectAnchorQuantityIdentity,
	setupAnchorQuantityScenario,
} from "./setupAnchorQuantityScenario.js";

// Contract: future anchors preserve ordinary current-period quantity policy and schedule one reset.
// Carried usage survives until the scheduled reset, which replenishes the final active grant.
for (const variant of [
	{ name: "prepaid", prepaid: true, license: false, deferred: false },
	{ name: "license", prepaid: false, license: true, deferred: false },
	{ name: "combined", prepaid: true, license: true, deferred: false },
	{ name: "deferred", prepaid: true, license: false, deferred: true },
]) {
	test.concurrent(`scheduled anchor quantities: ${variant.name}`, async () => {
		const customerId = `anchor-future-${variant.name}`;
		const oldQuantity = variant.deferred ? 500 : 300;
		const nextQuantity = variant.deferred ? 300 : 500;
		const scenario = await setupAnchorQuantityScenario({
			customerId,
			quantity: oldQuantity,
			seats: variant.license ? 3 : undefined,
			prepaidItem: items.prepaidMessages({
				prorationConfig: { onDecrease: OnDecrease.NoProrations },
			}),
		});
		const { autumnV2_4, ctx, advancedTo, target, licensePlan } = scenario;
		const resetAt = addDays(advancedTo, 7).getTime();
		await autumnV2_4.track(
			{ customer_id: customerId, feature_id: "messages", value: 40 },
			{ timeout: 2000 },
		);
		const ordinaryParams: UpdateSubscriptionV1ParamsInput = {
			...target,
			...(variant.prepaid
				? {
						feature_quantities: [
							{ feature_id: "messages", quantity: nextQuantity },
						],
					}
				: {}),
			...(variant.license
				? {
						license_quantities: [
							{ license_plan_id: licensePlan.id, quantity: 5 },
						],
					}
				: {}),
		};
		const params: UpdateSubscriptionV1ParamsInput = {
			...ordinaryParams,
			billing_cycle_anchor: resetAt,
		};
		const before = await scenario.readProduct();
		const control: BillingPreviewResponse =
			await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				ordinaryParams,
			);
		const preview: BillingPreviewResponse =
			await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expect(preview.total).toBeCloseTo(control.total, 2);
		expect(preview.line_items).toEqual(control.line_items);
		expect(await scenario.readProduct()).toEqual(before);
		const oldAmount = oldQuantity / 10 + (variant.license ? 60 : 0);
		const newAmount =
			(variant.prepaid ? nextQuantity : oldQuantity) / 10 +
			(variant.license ? 100 : 0);
		const expectedTotal = variant.deferred
			? 0
			: await calculateProratedDiff({
					customerId,
					advancedTo,
					oldAmount,
					newAmount,
				});
		expect(preview.total).toBeCloseTo(expectedTotal, 2);
		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>(params);
		const { product } = await expectAnchorQuantityIdentity({
			scenario,
			anchorMs: scenario.subscription.billing_cycle_anchor * 1000,
		});
		expect(product.billing_cycle_anchor_resets_at).toBe(resetAt);
		expect(
			product.options.find((option) => option.feature_id === "messages"),
		).toMatchObject({
			quantity:
				(variant.deferred
					? oldQuantity
					: variant.prepaid
						? nextQuantity
						: oldQuantity) / 100,
			...(variant.deferred ? { upcoming_quantity: nextQuantity / 100 } : {}),
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: "messages",
			remaining:
				(variant.deferred
					? oldQuantity
					: variant.prepaid
						? nextQuantity
						: oldQuantity) - 40,
			usage: 40,
			nextResetAt: resetAt,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: variant.deferred ? 1 : 2,
			...(variant.deferred ? {} : { latestTotal: expectedTotal }),
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		if (variant.prepaid && !variant.license) {
			await advanceTestClock({
				stripeCli: ctx.stripeCli,
				testClockId: scenario.testClockId!,
				advanceTo: addDays(resetAt, -1).getTime(),
			});
			await expectCustomerInvoiceCorrect({
				customerId,
				count: variant.deferred ? 1 : 2,
			});
			await expectAnchorQuantityIdentity({
				scenario,
				anchorMs: scenario.subscription.billing_cycle_anchor * 1000,
			});
			await advanceTestClock({
				stripeCli: ctx.stripeCli,
				testClockId: scenario.testClockId!,
				advanceTo: addDays(resetAt, 1).getTime(),
			});
			const after = await scenario.readProduct();
			expect(after.billing_cycle_anchor_resets_at).toBeNull();
			const finalOption = after.options.find(
				(option) => option.feature_id === "messages",
			);
			expect(finalOption?.quantity).toBe(nextQuantity / 100);
			expect(finalOption?.upcoming_quantity == null).toBe(true);
			await expectAnchorQuantityIdentity({ scenario, anchorMs: resetAt });
			await expectBalanceCorrect({
				customerId,
				autumn: autumnV2_4,
				featureId: "messages",
				remaining: nextQuantity,
				usage: 0,
				nextResetAt: addMonths(resetAt, 1).getTime(),
			});
			const nextPeriodEnd = addMonths(resetAt, 1).getTime();
			const originalPeriodEnd = addMonths(
				scenario.subscription.billing_cycle_anchor * 1000,
				1,
			).getTime();
			const ratio =
				(nextPeriodEnd - originalPeriodEnd) / (nextPeriodEnd - resetAt);
			// Stripe charges each item for the extension beyond the already-paid period.
			const resetInvoiceTotal = [20, nextQuantity / 10].reduce(
				(total, amount) => total + Math.round(amount * ratio * 100) / 100,
				0,
			);
			await expectCustomerInvoiceCorrect({
				customerId,
				count: variant.deferred ? 2 : 3,
				latestTotal: resetInvoiceTotal,
			});
			await expectStripeSubscriptionCorrect({ ctx, customerId });
		}
	});
}
