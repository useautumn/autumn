import { expect } from "bun:test";
import {
	OnDecrease,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { addDays, addMonths } from "date-fns";
import { CusService } from "@/internal/customers/CusService.js";
import {
	expectAnchorQuantityIdentity,
	setupAnchorQuantityScenario,
} from "./setupAnchorQuantityScenario.js";

// Contract: a scheduled anchor re-anchors the existing pool at the boundary, where deferred contributions
// turn current; the next read's lazy reset refills it at its final quantity, source balances stay zero.
export const expectScheduledPooledQuantity = async (quantity: number) => {
	const customerId = `anchor-scheduled-pool-${quantity}`;
	const scenario = await setupAnchorQuantityScenario({
		customerId,
		quantity: 500,
		pooled: true,
		prepaidItem: {
			...items.prepaidMessages({
				prorationConfig: { onDecrease: OnDecrease.NoProrations },
			}),
			pooled: true,
		},
	});
	const { autumnV2_4, ctx, target, advancedTo } = scenario;
	const resetAt = addDays(advancedTo, 7).getTime();
	await autumnV2_4.track(
		{ customer_id: customerId, feature_id: "messages", value: 40 },
		{ timeout: 2000 },
	);
	const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
	await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
		...target,
		billing_cycle_anchor: resetAt,
		feature_quantities: [{ feature_id: "messages", quantity }],
	});
	const scheduled = await getPooledBalanceDbState({ db: ctx.db, customerId });
	if (quantity <= 500) {
		expect(scheduled.pools[0].granted).toBe(500);
		expect(scheduled.poolCustomerEntitlements[0].balance).toBe(460);
	} else {
		const controlId = `${customerId}-ordinary`;
		const control = await setupAnchorQuantityScenario({
			customerId: controlId,
			quantity: 500,
			pooled: true,
			prepaidItem: { ...items.prepaidMessages(), pooled: true },
		});
		await autumnV2_4.track(
			{ customer_id: controlId, feature_id: "messages", value: 40 },
			{ timeout: 2000 },
		);
		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			...control.target,
			feature_quantities: [{ feature_id: "messages", quantity }],
		});
		const ordinary = await getPooledBalanceDbState({
			db: ctx.db,
			customerId: controlId,
		});
		expect(scheduled.pools[0].granted).toBe(ordinary.pools[0].granted);
		expect(scheduled.poolCustomerEntitlements[0].balance).toBe(
			ordinary.poolCustomerEntitlements[0].balance,
		);
	}
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: scenario.testClockId!,
		advanceTo: addDays(resetAt, 1).getTime(),
	});
	const reanchored = await getPooledBalanceDbState({
		db: ctx.db,
		customerId,
	});
	expect(reanchored.poolCustomerEntitlements[0]).toMatchObject({
		reset_cycle_anchor: resetAt,
	});
	await CusService.getFull({ ctx, idOrInternalId: customerId });
	const after = await getPooledBalanceDbState({ db: ctx.db, customerId });
	expect(after.poolCustomerEntitlements[0].balance).toBe(quantity);
	expect(after.pools[0]).toMatchObject({
		id: before.pools[0].id,
		granted: quantity,
		reset_cycle_anchor: resetAt,
	});
	expect(after.poolCustomerEntitlements[0].next_reset_at).toBe(
		addMonths(resetAt, 1).getTime(),
	);
	expect(after.contributions).toHaveLength(1);
	expect(after.contributions[0]).toMatchObject({
		id: before.contributions[0].id,
		current_contribution: quantity,
		next_cycle_contribution: quantity,
		effective_at: null,
	});
	expect(scheduled.poolCustomerEntitlements[0].next_reset_at).toBe(resetAt);
	const { product } = await expectAnchorQuantityIdentity({
		scenario,
		anchorMs: resetAt,
	});
	const option = product.options.find(
		(option) => option.feature_id === "messages",
	);
	expect(option?.quantity).toBe(quantity / 100);
	expect(option?.upcoming_quantity == null).toBe(true);
	expect(
		product.customer_entitlements.find(
			(entitlement) => entitlement.pooled_contribution_id,
		)?.balance,
	).toBe(0);
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_4,
		featureId: "messages",
		granted: quantity,
		remaining: quantity,
		usage: 0,
		nextResetAt: addMonths(resetAt, 1).getTime(),
	});
	const nextPeriodEnd = addMonths(resetAt, 1).getTime();
	const originalPeriodEnd = addMonths(
		scenario.subscription.billing_cycle_anchor * 1000,
		1,
	).getTime();
	const ratio = (nextPeriodEnd - originalPeriodEnd) / (nextPeriodEnd - resetAt);
	const resetTotal = [20, quantity / 10].reduce(
		(total, amount) => total + Math.round(amount * ratio * 100) / 100,
		0,
	);
	await expectCustomerInvoiceCorrect({
		customerId,
		count: quantity > 500 ? 3 : 2,
		latestTotal: resetTotal,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
	if (quantity > 0) {
		await autumnV2_4.track(
			{ customer_id: customerId, feature_id: "messages", value: 10 },
			{ timeout: 2000 },
		);
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: "messages",
			remaining: quantity - 10,
			usage: 10,
		});
	}
};
