/**
 * Bug: a usage_limits cap configured ONLY on the plan (product.billing_controls,
 * no customer/entity-level override) is enforced correctly by `track` (clamps
 * to 0 once exhausted) but NOT by `check` (`allowed` stays `true` forever).
 *
 * Root cause: mergePlanBillingControlsForCheck's mergeControlsByFeature()
 * resolves the plan-level usage_limits entry but never decorates it with the
 * current window's `usage` (unlike fullSubjectToApiUsageLimits, which uses
 * getCurrentUsageWindowUsage for customer/entity-level entries). With `usage`
 * missing, apiSubjectToUsageLimitHeadroom defaults it to 0, so headroom is
 * always the full `limit` and the cap never gates `check`.
 *
 * Red (pre-fix): after exhausting the cap via track, `check` still returns
 * `allowed: true`.
 * Green (post-fix): `check` returns `allowed: false` once the plan-level cap
 * is exhausted, matching what `track` already enforces.
 */

import { expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

// initScenario only exposes clients up to V2_2; build the latest-version client
// directly (same pattern as other usage-window tests).
const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("plan-only-usage-limit-check1: check reflects a PLAN-level usage cap once exhausted (no customer-level override)")}`,
	async () => {
		const customerProduct = products.base({
			id: "plan-only-uw-check",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			billingControls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit: 5,
						interval: ResetInterval.Day,
					},
				],
			},
		});

		const customerId = "plan-only-uw-check-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		// Exhaust the plan-level 5/day cap.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});

		// track already enforces the cap correctly: a further unit clamps to 0
		// instead of deducting (proven via the unaffected 1000-included balance).
		const overCapTrack = await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		expect(overCapTrack.balance?.usage).toBe(5);

		// The cap is exhausted (0 headroom); check must reflect that.
		const check = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
		});
		expect(check.allowed).toBe(false);
	},
);
