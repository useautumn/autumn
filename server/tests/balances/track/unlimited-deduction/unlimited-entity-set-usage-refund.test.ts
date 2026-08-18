/**
 * Unlimited-deduction feature — edge scenarios beyond the core track path:
 * entity-scoped items, the set_usage (POST /usage) path, and negative-value
 * (refund) tracks. Tracking on an unlimited cusEnt should really deduct:
 * `balance -= value` with no clamp, so the raw DB row drifts negative as a
 * usage counter while API output stays masked as unlimited.
 *
 * Contract under test (raw `customer_entitlements` rows, never API values):
 *   1. Entity-scoped unlimited item: track 5 against an entity moves that
 *      entity's balance inside the cusEnt `entities` jsonb to -5.
 *   2. set_usage 42 on an unlimited feature: raw balance becomes -42
 *      (targetBalance = grantedBalance(0) + prepaid(0) - usage).
 *   3. Track 10 then track -4: raw balance is -6 — negative tracks add back,
 *      no clamping at 0 in either direction.
 *
 * Red (current):  the `unlimitedFeatureIds` skip in executeRedisDeductionV2
 *                 short-circuits before any deduction, so raw balances stay
 *                 0 (and entity balances stay 0 / absent).
 * Green (after):  unlimited cusEnts deduct for real and the raw counters
 *                 above hold.
 */

import { expect, test } from "bun:test";
import type { ProductItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntil } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { findCustomerEntitlement } from "../../utils/findCustomerEntitlement.js";

const POLL_TIMEOUT_MS = 30_000;

// ── 1. Entity-scoped unlimited: per-entity balance drifts negative ──
test.concurrent(
	`${chalk.yellowBright("unlimited-deduction: entity-scoped track moves per-entity balance to -5 (raw DB)")}`,
	async () => {
		const customerId = "unlim-entity-scoped";

		const entityScopedUnlimitedMessages: ProductItem = {
			...constructFeatureItem({
				featureId: TestFeature.Messages,
				unlimited: true,
			}),
			entity_feature_id: TestFeature.Users,
		};

		const product = products.base({
			id: "unlim-entity-scoped-prod",
			items: [entityScopedUnlimitedMessages],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: "ent-1",
			feature_id: TestFeature.Messages,
			value: 5,
		});

		// Track flushes to Postgres lazily — poll the raw cusEnt row.
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
			until: (balances) => balances.some((balance) => balance === -5),
			timeoutMs: POLL_TIMEOUT_MS,
		});

		// One entity, its raw per-entity balance moved by -5.
		expect(entityBalances).toEqual([-5]);
	},
);

// ── 2. set_usage on unlimited: balance set to -usage ──
test.concurrent(
	`${chalk.yellowBright("unlimited-deduction: set_usage 42 sets raw balance to -42")}`,
	async () => {
		const customerId = "unlim-set-usage";

		const product = products.base({
			id: "unlim-set-usage-prod",
			items: [items.unlimitedMessages()],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		await autumnV2_3.usage({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 42,
		});

		// set_usage computes targetBalance = grantedBalance + prepaid - usage;
		// an unlimited cusEnt grants 0, so usage 42 => balance -42.
		const balance = await pollUntil({
			fetch: async () => {
				const cusEnt = await findCustomerEntitlement({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
				});
				return cusEnt?.balance ?? null;
			},
			until: (value) => value === -42,
			timeoutMs: POLL_TIMEOUT_MS,
		});

		expect(balance).toBe(-42);
	},
);

// ── 3. Negative track (refund): adds back, no clamp at 0 ──
test.concurrent(
	`${chalk.yellowBright("unlimited-deduction: track 10 then -4 leaves raw balance at -6")}`,
	async () => {
		const customerId = "unlim-refund";

		const product = products.base({
			id: "unlim-refund-prod",
			items: [items.unlimitedMessages()],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		const rawBalance = async () => {
			const cusEnt = await findCustomerEntitlement({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});
			return cusEnt?.balance ?? null;
		};

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		const balanceAfterTrack = await pollUntil({
			fetch: rawBalance,
			until: (value) => value === -10,
			timeoutMs: POLL_TIMEOUT_MS,
		});
		expect(balanceAfterTrack).toBe(-10);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -4,
		});

		const balanceAfterRefund = await pollUntil({
			fetch: rawBalance,
			until: (value) => value === -6,
			timeoutMs: POLL_TIMEOUT_MS,
		});
		expect(balanceAfterRefund).toBe(-6);
	},
);
