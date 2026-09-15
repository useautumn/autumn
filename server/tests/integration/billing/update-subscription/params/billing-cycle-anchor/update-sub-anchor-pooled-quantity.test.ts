import { expect, test } from "bun:test";
import {
	OnDecrease,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { addMonths } from "date-fns";
import {
	expectAnchorQuantityIdentity,
	setupAnchorQuantityScenario,
} from "./setupAnchorQuantityScenario.js";

// Contract: immediate prepaid decreases update the contribution and grant once while carrying usage;
// combined quantities, explicit usage reset and pool reset dates use the same final grant.
for (const variant of [
	{ name: "prepaid", combined: false },
	{ name: "combined", combined: true },
	{ name: "reset-usage", combined: false, resetUsage: true },
]) {
	const { combined } = variant;
	test.concurrent(`anchor pooled quantities: ${variant.name}`, async () => {
		const customerId = `anchor-pooled-${variant.name}`;
		const scenario = await setupAnchorQuantityScenario({
			customerId,
			quantity: 500,
			pooled: true,
			seats: combined ? 3 : undefined,
			prepaidItem: {
				...items.prepaidMessages({
					prorationConfig: { onDecrease: OnDecrease.NoProrations },
				}),
				pooled: true,
			},
		});
		const { autumnV2_4, ctx, target, advancedTo, licensePlan } = scenario;
		await autumnV2_4.track(
			{ customer_id: customerId, feature_id: "messages", value: 40 },
			{ timeout: 2000 },
		);
		const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(before.pools).toHaveLength(1);
		expect(before.pools[0].granted).toBe(500);
		const params: UpdateSubscriptionV1ParamsInput = {
			...target,
			billing_cycle_anchor: "now",
			...(variant.resetUsage ? { carry_over_usages: { enabled: false } } : {}),
			feature_quantities: [{ feature_id: "messages", quantity: 300 }],
			...(combined
				? {
						license_quantities: [
							{ license_plan_id: licensePlan.id, quantity: 5 },
						],
					}
				: {}),
		};
		const preview =
			await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expect(await getPooledBalanceDbState({ db: ctx.db, customerId })).toEqual(
			before,
		);
		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>(params);
		await expectAnchorQuantityIdentity({ scenario, anchorMs: advancedTo });
		const after = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(after.pools).toHaveLength(1);
		expect(after.pools[0].id).toBe(before.pools[0].id);
		expect(after.pools[0].granted).toBe(300);
		expect(after.pools[0].reset_cycle_anchor).toBe(advancedTo);
		expect(after.poolCustomerEntitlements[0].next_reset_at).toBe(
			addMonths(advancedTo, 1).getTime(),
		);
		expect(after.contributions).toHaveLength(1);
		expect(after.contributions[0]).toMatchObject({
			current_contribution: 300,
			next_cycle_contribution: 300,
			effective_at: null,
		});
		expect(after.poolCustomerEntitlements[0].balance).toBe(
			variant.resetUsage ? 300 : 260,
		);
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: "messages",
			granted: 300,
			remaining: variant.resetUsage ? 300 : 260,
			usage: variant.resetUsage ? 0 : 40,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	});
}
