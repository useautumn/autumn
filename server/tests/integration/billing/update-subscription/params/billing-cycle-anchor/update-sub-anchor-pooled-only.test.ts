import { expect, test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { addDays, addMonths } from "date-fns";
import {
	expectAnchorQuantityIdentity,
	setupAnchorQuantityScenario,
} from "./setupAnchorQuantityScenario.js";

// Contract: an anchor-only reset re-anchors the pool without touching its grant or usage.
test.concurrent("anchor pooled: anchor only", async () => {
	const customerId = "anchor-pooled-anchor-only";
	const scenario = await setupAnchorQuantityScenario({
		customerId,
		quantity: 500,
		pooled: true,
		prepaidItem: { ...items.prepaidMessages(), pooled: true },
	});
	const { autumnV2_4, ctx, target, advancedTo } = scenario;
	await autumnV2_4.track(
		{ customer_id: customerId, feature_id: "messages", value: 40 },
		{ timeout: 2000 },
	);
	const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
	expect(before.pools).toHaveLength(1);

	await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
		...target,
		billing_cycle_anchor: "now",
	});

	await expectAnchorQuantityIdentity({ scenario, anchorMs: advancedTo });
	const after = await getPooledBalanceDbState({ db: ctx.db, customerId });
	expect(after.pools).toHaveLength(1);
	expect(after.pools[0].id).toBe(before.pools[0].id);
	expect(after.pools[0].granted).toBe(500);
	expect(after.pools[0].reset_cycle_anchor).toBe(advancedTo);
	expect(after.poolCustomerEntitlements[0].next_reset_at).toBe(
		addMonths(advancedTo, 1).getTime(),
	);
	expect(after.poolCustomerEntitlements[0].balance).toBe(460);
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// Contract: a future anchor pulls the pool's next reset to that date, like the plan's own balances.
test.concurrent("anchor pooled: scheduled anchor only", async () => {
	const customerId = "anchor-pooled-scheduled-only";
	const scenario = await setupAnchorQuantityScenario({
		customerId,
		quantity: 500,
		pooled: true,
		prepaidItem: { ...items.prepaidMessages(), pooled: true },
	});
	const { autumnV2_4, ctx, target, advancedTo } = scenario;
	const scheduledAnchorMs = addDays(advancedTo, 4).getTime();
	const before = await getPooledBalanceDbState({ db: ctx.db, customerId });

	await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
		...target,
		billing_cycle_anchor: scheduledAnchorMs,
	});

	const after = await getPooledBalanceDbState({ db: ctx.db, customerId });
	expect(after.pools[0].id).toBe(before.pools[0].id);
	expect(after.pools[0].granted).toBe(500);
	expect(after.pools[0].reset_cycle_anchor).toBe(
		before.pools[0].reset_cycle_anchor,
	);
	expect(after.poolCustomerEntitlements[0].next_reset_at).toBe(
		scheduledAnchorMs,
	);
});
