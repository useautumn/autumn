/**
 * TDD contract: a prepaid rollover survives a move onto a POOLED item whose
 * rollover signature does not match the one that minted it.
 *
 * Contract under test:
 *   New behaviors:
 *     - removing BOTH same-feature credit items (prepaid + overage) and adding a
 *       single pooled included item carries the prepaid rollover onto the pool,
 *       even though the outgoing item is prepaid and the incoming one is included
 *     - the carried amount stays subject to the POOLED cusEnt's rollover cap
 *       (performMaximumClearing), not the outgoing prepaid item's cap
 *     - both surfaces that reach the patch semantics behave identically:
 *       subscriptions.update and the update_plan migration
 *   Side effects:
 *     - the carried rollovers row belongs to the synthetic pooled cusEnt
 *     - the customer's readable balance = pooled grant + carried rollover
 *
 * Pre-impl red: the carry is scored by billing-kind match, so a prepaid-minted
 * rollover finds no kind-matching candidate among the incoming items and is
 * dropped.
 * Post-impl green: the rollover lands on the pooled cusEnt.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingMethod,
	ResetInterval,
	RolloverExpiryDurationType,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const BILLING_UNITS = 100;
const PREPAID_GRANT = 200;
const USAGE = 40;
const POOLED_GRANT = 10_000;

// 50% of the 200 prepaid grant = 100, BELOW the 160 left after usage, so the
// outgoing cap binds first and only 100 is ever minted.
const CARRIED = PREPAID_GRANT * 0.5;

const rolloverConfig = {
	max_percentage: 50,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

/** Drop both same-feature credit items, add one pooled included item. */
const customization = {
	remove_items: [
		{ feature_id: TestFeature.Credits, billing_method: BillingMethod.Prepaid },
		{
			feature_id: TestFeature.Credits,
			billing_method: BillingMethod.UsageBased,
		},
	],
	add_items: [
		{
			feature_id: TestFeature.Credits,
			included: POOLED_GRANT,
			pooled: true,
			reset: { interval: ResetInterval.Month },
			rollover: {
				max_percentage: 50,
				expiry_duration_type: RolloverExpiryDurationType.Month,
				expiry_duration_length: 1,
			},
		},
	],
};

/** Pro plan on a prepaid credit bucket with a rollover, plus an overage bucket. */
const setupPrepaidOverageCredits = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const prepaidCredits = items.prepaid({
		featureId: TestFeature.Credits,
		billingUnits: BILLING_UNITS,
		price: 10,
		includedUsage: 0,
	});
	const creditsPro = products.pro({
		id: `${customerId}-pro`,
		items: [
			{
				...prepaidCredits,
				config: { ...prepaidCredits.config, rollover: rolloverConfig },
			},
			items.consumable({
				featureId: TestFeature.Credits,
				includedUsage: 0,
				price: 0.1,
				billingUnits: 1,
			}),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [creditsPro] }),
		],
		actions: [
			s.billing.attach({
				productId: creditsPro.id,
				// quantity is in feature units, not billing units.
				options: [{ feature_id: TestFeature.Credits, quantity: PREPAID_GRANT }],
			}),
			s.track({ featureId: TestFeature.Credits, value: USAGE, timeout: 2000 }),
			// Both credit items are price-backed on a live subscription, so the reset
			// that mints the rollover runs off invoice.created, not the cron.
			s.advanceToNextInvoice(),
		],
	});

	const customerAfterReset =
		await scenario.autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
	expect(customerAfterReset.balances?.[TestFeature.Credits]?.remaining).toBe(
		PREPAID_GRANT + CARRIED,
	);

	const beforeMove = await getPooledBalanceDbState({
		db: scenario.ctx.db,
		customerId,
	});
	expect(beforeMove.pools).toHaveLength(0);

	return { ...scenario, customerId, plan: creditsPro };
};

const expectRolloverCarriedToPool = async ({
	scenario,
}: {
	scenario: Awaited<ReturnType<typeof setupPrepaidOverageCredits>>;
}) => {
	const { ctx, customerId, autumnV2_3 } = scenario;

	const afterMove = await getPooledBalanceDbState({ db: ctx.db, customerId });
	expect(afterMove.pools).toHaveLength(1);
	expect(afterMove.pools[0].granted).toBe(POOLED_GRANT);

	// ── Contract: the rollover lands on the POOLED cusEnt ────────────
	const pooledCustomerEntitlement = afterMove.poolCustomerEntitlements[0];
	const pooledRollovers = pooledCustomerEntitlement.rollovers ?? [];
	expect(pooledRollovers).toHaveLength(1);

	// The pooled cap (50% of 10k = 5000) does not bind, so the full 100 survives
	// — the carry is clamped by the pool's rules, not erased by them.
	expect(pooledRollovers[0].balance).toBe(CARRIED);

	// ── Contract: it is readable, not stranded on the zeroed source ──
	const customerAfterMove = await autumnV2_3.customers.get<ApiCustomerV5>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerAfterMove.balances?.[TestFeature.Credits]?.remaining).toBe(
		POOLED_GRANT + CARRIED,
	);
};

test(
	chalk.yellowBright(
		"pooled rollover carry (update subscription): a prepaid rollover carries onto a pooled included item despite the signature mismatch",
	),
	async () => {
		const scenario = await setupPrepaidOverageCredits({
			customerId: "prepaid-overage-to-pooled-update-sub",
		});

		await scenario.autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			{
				customer_id: scenario.customerId,
				plan_id: scenario.plan.id,
				customize: customization,
			},
		);

		await expectRolloverCarriedToPool({ scenario });
	},
);

test(
	chalk.yellowBright(
		"pooled rollover carry (update_plan migration): a prepaid rollover carries onto a pooled included item despite the signature mismatch",
	),
	async () => {
		const scenario = await setupPrepaidOverageCredits({
			customerId: "prepaid-overage-to-pooled-migration",
		});
		const planId = scenario.plan.id;

		await runUpdatePlanMigration({
			ctx: scenario.ctx,
			migrationClient: scenario.autumnV2_2,
			// Migration ids are unique per org+env and outlive the test run.
			migrationId: `${scenario.customerId}-mig-${Date.now()}`,
			customerId: scenario.customerId,
			filter: { customer: { plan: { plan_id: planId } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: planId },
						customize: customization,
					},
				],
			},
			runOnServer: false,
		});

		await expectRolloverCarriedToPool({ scenario });
	},
);
