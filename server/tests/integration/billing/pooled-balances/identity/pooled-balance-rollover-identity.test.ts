/**
 * Contract: rollover config is part of pool identity.
 *
 * Five free pooled plans on the same feature and interval, each on its own entity,
 * so the ONLY identity difference is rollover_signature:
 *   - no rollover                                    -> its own pool
 *   - max_percentage 50                              -> its own pool
 *   - max_percentage 25                              -> its own pool
 *   - { duration, length } (max/max_percentage omitted)  ─┐ same signature,
 *   - { max: null, max_percentage: null, duration, length } ┘ so ONE shared pool
 *
 * The last pair is the undefined-vs-null guard: RolloverConfigSchema declares max
 * and max_percentage as .nullable().optional(), so zod normalizes neither. If the
 * signature ever distinguished them, these two would split into separate pools and
 * silently stop sharing a balance.
 *
 * Complements rolloverConfigToSignature.test.ts, which asserts the same
 * normalization on the pure helper — this proves it survives the API + DB round trip.
 */

import { expect, test } from "bun:test";
import { EntInterval, RolloverExpiryDurationType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	getPooledBalanceDbState,
	getPooledSourceCustomerProduct,
} from "../utils/getPooledBalanceDbState.js";

const GRANT = 100;
const GROUP = "pooled-rollover-identity-group";

const plainPlan = ({ id }: { id: string }) =>
	products.base({
		id,
		group: GROUP,
		items: [
			{ ...items.monthlyMessages({ includedUsage: GRANT }), pooled: true },
		],
	});

const rolloverPlan = ({
	id,
	rolloverConfig,
}: {
	id: string;
	// biome-ignore lint/suspicious/noExplicitAny: exercising nullable/optional shapes
	rolloverConfig: any;
}) =>
	products.base({
		id,
		group: GROUP,
		items: [
			{
				...items.monthlyMessagesWithRollover({
					includedUsage: GRANT,
					rolloverConfig,
				}),
				pooled: true,
			},
		],
	});

test(
	chalk.yellowBright(
		"pooled identity: rollover config splits pools, and omitted vs null caps share one",
	),
	async () => {
		const customerId = "pooled-rollover-identity";

		const noRollover = plainPlan({ id: "pooled-rollover-none" });
		const halfCap = rolloverPlan({
			id: "pooled-rollover-half",
			rolloverConfig: {
				max_percentage: 50,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
		});
		const quarterCap = rolloverPlan({
			id: "pooled-rollover-quarter",
			rolloverConfig: {
				max_percentage: 25,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
		});
		// Same config expressed two ways: omitted caps vs explicit nulls.
		const compactCaps = rolloverPlan({
			id: "pooled-rollover-compact",
			rolloverConfig: {
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
		});
		const explicitNullCaps = rolloverPlan({
			id: "pooled-rollover-explicit-null",
			rolloverConfig: {
				max: null,
				max_percentage: null,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
		});

		const plans = [
			noRollover,
			halfCap,
			quarterCap,
			compactCaps,
			explicitNullCaps,
		];

		const { entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: plans.length, featureId: TestFeature.Users }),
				s.products({ list: plans }),
			],
			actions: plans.map((plan, index) =>
				s.billing.attach({ productId: plan.id, entityIndex: index }),
			),
		});

		const state = await getPooledBalanceDbState({ db: ctx.db, customerId });

		// ── Contract: one contribution per plan ──────────────────────────
		expect(state.contributions).toHaveLength(plans.length);

		// ── Contract: four distinct identities, not five ─────────────────
		expect(state.pools).toHaveLength(4);
		expect(
			new Set(state.pools.map((pool) => pool.rollover_signature)).size,
		).toBe(4);

		// Every pool shares feature/interval, so rollover_signature is the only
		// thing that can be separating them.
		for (const pool of state.pools) {
			expect(pool.interval).toBe(EntInterval.Month);
			expect(pool.stripe_subscription_id).toBeNull();
		}

		const poolIdForPlan = ({
			plan,
			entityIndex,
		}: {
			plan: { id: string };
			entityIndex: number;
		}) => {
			const customerProduct = getPooledSourceCustomerProduct({
				state,
				productId: plan.id,
				entityId: entities[entityIndex].id,
			});
			const contribution = state.contributions.find(
				(candidate) =>
					candidate.source_customer_product_id === customerProduct.id,
			);
			if (!contribution) {
				throw new Error(`no contribution found for plan '${plan.id}'`);
			}
			return contribution.pooled_balance_id;
		};

		const nonePoolId = poolIdForPlan({ plan: noRollover, entityIndex: 0 });
		const halfPoolId = poolIdForPlan({ plan: halfCap, entityIndex: 1 });
		const quarterPoolId = poolIdForPlan({ plan: quarterCap, entityIndex: 2 });
		const compactPoolId = poolIdForPlan({ plan: compactCaps, entityIndex: 3 });
		const explicitNullPoolId = poolIdForPlan({
			plan: explicitNullCaps,
			entityIndex: 4,
		});

		// ── Contract: differing configs never share a pool ───────────────
		expect(new Set([nonePoolId, halfPoolId, quarterPoolId]).size).toBe(3);
		expect(nonePoolId).not.toBe(compactPoolId);
		expect(halfPoolId).not.toBe(compactPoolId);
		expect(quarterPoolId).not.toBe(compactPoolId);

		// ── Contract: omitted caps and explicit nulls are the SAME identity ─
		expect(compactPoolId).toBe(explicitNullPoolId);

		const sharedPool = state.pools.find((pool) => pool.id === compactPoolId);
		expect(sharedPool?.granted).toBe(GRANT * 2);
	},
);
