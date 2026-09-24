import { expect, test } from "bun:test";
import {
	OnDecrease,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { addDays, addMonths } from "date-fns";
import { setupAnchorQuantityScenario } from "./setupAnchorQuantityScenario.js";

// Contract: a deferred decrease to zero grants zero at both a scheduled anchor and ordinary renewal.
// The active option, persisted allowance, and API balance agree after consuming the pending change.
for (const scheduled of [true, false]) {
	test.concurrent(
		`deferred zero quantity: ${scheduled ? "scheduled anchor" : "ordinary renewal"}`,
		async () => {
			const customerId = `anchor-zero-${scheduled ? "scheduled" : "renewal"}`;
			const scenario = await setupAnchorQuantityScenario({
				customerId,
				quantity: 500,
				prepaidItem: items.prepaidMessages({
					prorationConfig: { onDecrease: OnDecrease.NoProrations },
				}),
			});
			const { autumnV2_4, ctx, advancedTo, target } = scenario;
			const originalAnchor = scenario.subscription.billing_cycle_anchor * 1000;
			const boundary = scheduled
				? addDays(advancedTo, 7).getTime()
				: addMonths(originalAnchor, 1).getTime();
			await autumnV2_4.track(
				{ customer_id: customerId, feature_id: "messages", value: 40 },
				{ timeout: 2000 },
			);
			await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
				...target,
				feature_quantities: [{ feature_id: "messages", quantity: 0 }],
				...(scheduled ? { billing_cycle_anchor: boundary } : {}),
			});
			const pending = await scenario.readProduct();
			expect(
				pending.options.find((option) => option.feature_id === "messages"),
			).toMatchObject({ quantity: 5, upcoming_quantity: 0 });
			await expectBalanceCorrect({
				customerId,
				autumn: autumnV2_4,
				featureId: "messages",
				remaining: 460,
				usage: 40,
			});
			await advanceTestClock({
				stripeCli: ctx.stripeCli,
				testClockId: scenario.testClockId!,
				advanceTo: addDays(boundary, 1).getTime(),
			});
			const after = await scenario.readProduct();
			const option = after.options.find(
				(option) => option.feature_id === "messages",
			);
			expect(option?.quantity).toBe(0);
			expect(option?.upcoming_quantity == null).toBe(true);
			expect(
				after.customer_entitlements.find(
					(entitlement) => entitlement.entitlement.feature.id === "messages",
				)?.balance,
			).toBe(0);
			await expectBalanceCorrect({
				customerId,
				autumn: autumnV2_4,
				featureId: "messages",
				remaining: 0,
				granted: 0,
				usage: 0,
				nextResetAt: addMonths(boundary, 1).getTime(),
			});
			const nextPeriodEnd = addMonths(boundary, 1).getTime();
			const ratio = scheduled
				? (nextPeriodEnd - addMonths(originalAnchor, 1).getTime()) /
					(nextPeriodEnd - boundary)
				: 1;
			await expectCustomerInvoiceCorrect({
				customerId,
				count: 2,
				latestTotal: Math.round(2000 * ratio) / 100,
			});
		},
	);
}
