/**
 * PR #2862 review regressions — two bugs in the unlimited-sink implementation:
 *
 * 1. Mixed finite + unlimited (hoist): `sortCusEntsForDeduction` only prefers
 *    unlimited WITHIN a tier — non-credit features sort before credit-system
 *    parents regardless of unlimited. Without hoisting the unlimited entry to
 *    the front, tracking a metered resident feature (action1) drains the
 *    finite balance before the unlimited credits sink is reached. The old
 *    skip deducted NOTHING from finite siblings, so the sink must absorb
 *    everything and leave the metered balance untouched.
 *
 * 2. Aggregate set_usage (entity-scoped, no entity_id): target_balance is the
 *    TOTAL across entities (getUpdateUsageTargetBalance sums them). Setting
 *    every entity to the target doubles usage with two entities; the sink
 *    must apply the aggregate delta instead.
 *
 * Red (pre-fix):  test 1 — metered action1 drains (100 → 95) and credits
 *                 stays 0; test 2 — each entity lands at -42 (sum -84).
 * Green (fixed):  test 1 — action1 stays 100, credits absorbs -1
 *                 (5 × 0.2 credit_cost); test 2 — entity balances SUM to -42.
 */

import { expect, test } from "bun:test";
import type { ProductItem, TrackResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntil } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { findCustomerEntitlement } from "../../utils/findCustomerEntitlement.js";

const POLL_TIMEOUT_MS = 30_000;

// ── 1. Mixed: metered resident feature + unlimited credit parent ──
test.concurrent(
	`${chalk.yellowBright("unlimited-mixed: unlimited credits absorbs the track, metered action1 stays untouched")}`,
	async () => {
		const customerId = "unlim-mixed-finite";
		const includedActionUsage = 100;

		const mixedProduct = products.base({
			id: "unlim-mixed-prod",
			items: [
				constructFeatureItem({
					featureId: TestFeature.Action1,
					includedUsage: includedActionUsage,
				}) as ProductItem,
				items.unlimited({ featureId: TestFeature.Credits }),
			],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [mixedProduct] }),
			],
			actions: [s.attach({ productId: mixedProduct.id })],
		});

		const creditSystem = ctx.features.find((f) => f.id === TestFeature.Credits);
		expect(creditSystem).toBeDefined();

		const trackValue = 5;
		const expectedCreditCost = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditSystem!,
			amount: trackValue,
		});

		const trackRes = (await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: trackValue,
		})) as TrackResponseV3;
		expect(trackRes.customer_id).toBe(customerId);

		// The unlimited credits sink absorbs the whole track (5 × 0.2 = 1).
		const creditsBalance = await pollUntil({
			fetch: async () => {
				const creditsCusEnt = await findCustomerEntitlement({
					ctx,
					customerId,
					featureId: TestFeature.Credits,
				});
				return creditsCusEnt?.balance;
			},
			until: (balance) => balance === -expectedCreditCost,
			timeoutMs: POLL_TIMEOUT_MS,
		});
		expect(creditsBalance).toBe(-expectedCreditCost);

		// The metered action1 balance must be untouched — the old skip deducted
		// nothing from finite siblings, and the sink must preserve that.
		const actionCusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Action1,
		});
		expect(actionCusEnt?.balance).toBe(includedActionUsage);
	},
	{ timeout: 90_000 },
);

// ── 2. Aggregate set_usage across entities ──
test.concurrent(
	`${chalk.yellowBright("unlimited-aggregate: set_usage 42 with two entities sums to -42, never -42 each")}`,
	async () => {
		const customerId = "unlim-agg-set-usage";

		const entityScopedUnlimitedMessages: ProductItem = {
			...constructFeatureItem({
				featureId: TestFeature.Messages,
				unlimited: true,
			}),
			entity_feature_id: TestFeature.Users,
		};

		const product = products.base({
			id: "unlim-agg-prod",
			items: [entityScopedUnlimitedMessages],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		// No entity_id: target_balance carries aggregate semantics.
		await autumnV2_3.usage({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 42,
		});

		const entityBalances = await pollUntil({
			fetch: async () => {
				const cusEnt = await findCustomerEntitlement({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
				});
				return Object.values(cusEnt?.entities ?? {}).map(
					(entityBalance) => entityBalance.balance,
				);
			},
			until: (balances) =>
				balances.length === 2 &&
				balances.reduce((sum, balance) => sum + balance, 0) === -42,
			timeoutMs: POLL_TIMEOUT_MS,
		});

		// Aggregate usage is 42 — the per-entity split is the sink's sequential
		// distribution, but the SUM must equal the target. The per-entity sync
		// bug recorded -42 on BOTH entities (sum -84).
		const total = entityBalances.reduce((sum, balance) => sum + balance, 0);
		expect(entityBalances).toHaveLength(2);
		expect(total).toBe(-42);
	},
	{ timeout: 90_000 },
);
