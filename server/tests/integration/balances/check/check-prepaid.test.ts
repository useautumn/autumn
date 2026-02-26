/**
 * Check Prepaid Balance Tests
 *
 * Verifies that the /check endpoint returns correct balance structures
 * for prepaid features:
 * - Basic prepaid: V1 and V2 response shapes, allowed/disallowed by required_balance
 * - Tiered prepaid: user-facing tiers INCLUDE included usage in boundaries
 * - Balance totals (granted, usage, remaining) are correct after attach
 */

import { expect, test } from "bun:test";
import {
	BillingMethod,
	type CheckResponseV1,
	type CheckResponseV2,
	type CheckResponseV3,
	TierBehavior,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Tiered prepaid: included=100, graduated tiers (internal: 0-500 @ $10, 501+ @ $5)
// User-facing tiers should INCLUDE included (100): 0-600 @ $10, 601+ @ $5
// ═══════════════════════════════════════════════════════════════════

const INCLUDED_USAGE = 100;
const BILLING_UNITS = 100;
const PREPAID_QUANTITY = 300;

const TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test.concurrent(`${chalk.yellowBright("check-prepaid: tiered balance.price tiers include included usage")}`, async () => {
	const customerId = "check-prepaid-tiered-tiers";

	const tieredPrepaidItem = items.tieredPrepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const freeProd = products.base({
		id: "tiered-prepaid",
		items: [tieredPrepaidItem],
	});

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [freeProd] }),
		],
		actions: [
			s.attach({
				productId: freeProd.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: PREPAID_QUANTITY },
				],
			}),
		],
	});

	const res = (await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV3;

	expect(res.allowed).toBe(true);
	expect(res.balance).toBeDefined();
	expect(res.balance?.breakdown).toHaveLength(1);

	const breakdown = res.balance?.breakdown?.[0];
	expect(breakdown?.price).toBeDefined();
	expect(breakdown?.price).toMatchObject({
		billing_units: BILLING_UNITS,
		billing_method: BillingMethod.Prepaid,
		tier_behavior: TierBehavior.Graduated,
	});

	// Internal tiers: [{to:500, amount:10}, {to:"inf", amount:5}]
	// User-facing tiers add included (100): [{to:600, amount:10}, {to:"inf", amount:5}]
	expect(breakdown?.price?.tiers).toEqual([
		{ to: 600, amount: 10 },
		{ to: "inf", amount: 5 },
	]);
	expect(breakdown?.price?.amount).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright("check-prepaid: tiered balance totals correct after attach")}`, async () => {
	const customerId = "check-prepaid-tiered-totals";

	const tieredPrepaidItem = items.tieredPrepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const freeProd = products.base({
		id: "tiered-prepaid-totals",
		items: [tieredPrepaidItem],
	});

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [freeProd] }),
		],
		actions: [
			s.billing.attach({
				productId: freeProd.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: PREPAID_QUANTITY },
				],
			}),
		],
	});

	const res = (await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV3;

	expect(res.balance).toMatchObject({
		feature_id: TestFeature.Messages,
		unlimited: false,
		granted: PREPAID_QUANTITY,
		usage: 0,
	});

	// Remaining = purchased
	expect(res.balance?.remaining).toBe(PREPAID_QUANTITY);
});

// ═══════════════════════════════════════════════════════════════════
// Basic prepaid: single price ($8.50/pack), included=100, quantity=500
// Verifies V1 and V2 response shapes, and allowed/disallowed thresholds
// ═══════════════════════════════════════════════════════════════════

const BASIC_INCLUDED = 100;
const BASIC_QUANTITY = 500;
const TOTAL_BALANCE = BASIC_QUANTITY + BASIC_INCLUDED;

test.concurrent(`${chalk.yellowBright("check-prepaid: basic V1/V2 response shape + allowed thresholds")}`, async () => {
	const customerId = "check-prepaid-basic";

	const prepaidItem = items.prepaidMessages({
		includedUsage: BASIC_INCLUDED,
		billingUnits: 100,
		price: 8.5,
	});

	const freeProd = products.base({
		id: "basic-prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [freeProd] }),
		],
		actions: [
			s.attach({
				productId: freeProd.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: BASIC_QUANTITY },
				],
			}),
		],
	});

	// ── V2 response shape ──────────────────────────────────────────
	const v2Res = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(v2Res).toMatchObject({
		allowed: true,
		customer_id: customerId,
		required_balance: 1,
		balance: {
			feature_id: TestFeature.Messages,
			unlimited: false,
			granted_balance: BASIC_INCLUDED,
			purchased_balance: BASIC_QUANTITY,
			current_balance: TOTAL_BALANCE,
			usage: 0,
			max_purchase: null,
			overage_allowed: false,
			reset: { interval: "month" },
		},
	});
	expect(v2Res.balance?.reset?.resets_at).toBeDefined();

	// ── Allowed threshold ──────────────────────────────────────────
	const allowedRes = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: TOTAL_BALANCE - 1,
	})) as unknown as CheckResponseV2;
	expect(allowedRes.allowed).toBe(true);

	// ── Disallowed threshold ───────────────────────────────────────
	const disallowedRes = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: TOTAL_BALANCE + 1,
	})) as unknown as CheckResponseV2;
	expect(disallowedRes.allowed).toBe(false);

	// ── V1 response shape ──────────────────────────────────────────
	const v1Res = (await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV1;

	expect(v1Res).toMatchObject({
		allowed: true,
		code: "feature_found",
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
		interval: "month",
		interval_count: 1,
		unlimited: false,
		balance: TOTAL_BALANCE,
		usage: 0,
		included_usage: TOTAL_BALANCE,
		overage_allowed: false,
	});
});
