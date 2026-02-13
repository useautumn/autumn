import { expect, test } from "bun:test";
import {
	type CheckResponseV0,
	type CheckResponseV1,
	type CheckResponseV2,
	SuccessCode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// CHECK: Feature with usage limits (initial state, no tracking)
// Migrated from: check-basic.test.ts / check-usage-limits
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-max-purchase-initial: /check on feature with usage limits")}`, async () => {
	const maxPurchase = 400;
	const messagesFeature = items.consumableMessages({
		includedUsage: 100,
		maxPurchase,
		price: 0.5,
	});

	const proProd = products.pro({
		id: "pro",
		items: [messagesFeature],
	});

	const { customerId, autumnV0, autumnV1, autumnV2 } = await initScenario({
		customerId: "check-max-purchase-initial",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [proProd] }),
		],
		actions: [s.attach({ productId: proProd.id })],
	});

	const usageLimit = maxPurchase + messagesFeature.included_usage;

	// ─────────────────────────────────────────────────────────────────
	// Check with required_balance = usageLimit (should be allowed)
	// ─────────────────────────────────────────────────────────────────

	const resV2Allowed = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: usageLimit,
	})) as unknown as CheckResponseV2;

	expect(resV2Allowed.allowed).toBe(true);

	// ─────────────────────────────────────────────────────────────────
	// Check with required_balance > usageLimit (should NOT be allowed)
	// ─────────────────────────────────────────────────────────────────

	// v2 response
	const resV2 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: usageLimit + 1,
	})) as unknown as CheckResponseV2;

	expect(resV2).toMatchObject({
		allowed: false,
		customer_id: customerId,
		required_balance: usageLimit + 1,
		balance: {
			feature_id: "messages",
			unlimited: false,
			granted_balance: messagesFeature.included_usage,
			purchased_balance: 0,
			current_balance: messagesFeature.included_usage,
			usage: 0,
			max_purchase: maxPurchase,
			overage_allowed: true,
			reset: {
				interval: "month",
			},
		},
	});

	// v1 response
	const resV1 = (await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: usageLimit + 1,
	})) as unknown as CheckResponseV1;

	expect(resV1).toMatchObject({
		allowed: false,
		customer_id: customerId,
		balance: messagesFeature.included_usage,
		feature_id: TestFeature.Messages as string,
		required_balance: usageLimit + 1,
		code: SuccessCode.FeatureFound,
		unlimited: false,
		usage: 0,
		included_usage: messagesFeature.included_usage,
		overage_allowed: false,
		usage_limit: usageLimit,
		interval: "month",
		interval_count: 1,
	});
	expect(resV1.next_reset_at).toBeDefined();

	// v0 response
	const resV0 = (await autumnV0.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: usageLimit + 1,
	})) as unknown as CheckResponseV0;

	expect(resV0.allowed).toBe(false);
	expect(resV0.balances).toBeDefined();
	expect(resV0.balances).toHaveLength(1);
	expect(resV0.balances[0]).toMatchObject({
		balance: messagesFeature.included_usage,
		required: usageLimit + 1,
		feature_id: TestFeature.Messages,
	});
});

// ═══════════════════════════════════════════════════════════════════
// CHECK: Prepaid + pay-per-use feature with usage limits (with tracking)
// Migrated from: server/tests/balances/check/prepaid/check-prepaid2.test.ts
//
// Setup:
// - Prepaid item: includedUsage=100, billingUnits=100, price=8.5
// - Usage item: includedUsage=200, price=0.5, maxPurchase=300
// - Attach with prepaidQuantity=500
//
// Total granted_balance = 100 + 200 = 300
// Total initial balance = 300 (granted) + 500 (prepaid) = 800
//
// Tracking sequence:
// 1. Track 500 → all goes to prepaid first
// 2. Track 500 → 100 from prepaid, 200 from usage granted, 200 paid overage
// 3. Track 200 → only 100 used due to usage limit cap
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-max-purchase-prepaid-consumable: /check on prepaid + pay-per-use with usage limits")}`, async () => {
	const prepaidItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 8.5,
	});

	const maxPurchase = 300;
	const usageItem = items.consumableMessages({
		includedUsage: 200,
		price: 0.5,
		maxPurchase,
	});

	const prod = products.base({
		id: "prepaid-consumable",
		items: [prepaidItem, usageItem],
	});

	const prepaidQuantity = 500;
	const grantedBalance = prepaidItem.included_usage + usageItem.included_usage; // 300

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "check-max-purchase-prepaid-consumable",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: prepaidQuantity,
					},
				],
			}),
		],
	});

	// ─────────────────────────────────────────────────────────────────
	// Initial state (no usage)
	// ─────────────────────────────────────────────────────────────────

	const resV2Initial = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resV2Initial).toMatchObject({
		allowed: true,
		customer_id: customerId,
		required_balance: 1,
		balance: {
			feature_id: TestFeature.Messages,
			unlimited: false,
			granted_balance: grantedBalance,
			purchased_balance: prepaidQuantity,
			current_balance: prepaidQuantity + grantedBalance,
			usage: 0,
			max_purchase: null, // Aggregated is null since prepaid has no limit
			overage_allowed: true,
			reset: {
				interval: prepaidItem.interval,
			},
		},
	});
	expect(resV2Initial.balance?.reset?.resets_at).toBeDefined();

	// Verify breakdowns
	expect(resV2Initial.balance?.breakdown).toHaveLength(2);
	expect(resV2Initial.balance?.breakdown).toContainEqual(
		expect.objectContaining({
			granted_balance: prepaidItem.included_usage,
			purchased_balance: prepaidQuantity,
			current_balance: prepaidQuantity + prepaidItem.included_usage,
			usage: 0,
			max_purchase: null,
			overage_allowed: false,
		}),
	);
	expect(resV2Initial.balance?.breakdown).toContainEqual(
		expect.objectContaining({
			granted_balance: usageItem.included_usage,
			purchased_balance: 0,
			current_balance: usageItem.included_usage,
			usage: 0,
			max_purchase: maxPurchase,
			overage_allowed: true,
		}),
	);

	// V1 response for initial state
	const resV1Initial = (await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV1;

	expect(resV1Initial).toMatchObject({
		allowed: true,
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
		interval: prepaidItem.interval,
		unlimited: false,
		included_usage: prepaidQuantity + grantedBalance,
		balance: prepaidQuantity + grantedBalance,
		usage: 0,
	});

	// ─────────────────────────────────────────────────────────────────
	// Track 600: All usage goes to prepaid balance first
	// ─────────────────────────────────────────────────────────────────

	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 600,
	});

	const resAfterTrack600 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resAfterTrack600.balance).toMatchObject({
		granted_balance: grantedBalance,
		current_balance: 200,
		usage: 600,
		purchased_balance: 500,
	});

	expect(resAfterTrack600.balance?.breakdown).toContainEqual(
		expect.objectContaining({
			granted_balance: prepaidItem.included_usage,
			purchased_balance: prepaidQuantity,
			current_balance: 0,
			usage: 600,
			overage_allowed: false,
		}),
	);

	// ─────────────────────────────────────────────────────────────────
	// Track another 400: 200 from usage granted, 200 paid
	// ─────────────────────────────────────────────────────────────────

	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 400,
	});

	const resAfterTrack1000 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resAfterTrack1000.balance).toMatchObject({
		granted_balance: grantedBalance,
		current_balance: 0,
		usage: 1000,
		purchased_balance: prepaidQuantity + 200,
	});

	expect(resAfterTrack1000.balance?.breakdown).toContainEqual(
		expect.objectContaining({
			granted_balance: prepaidItem.included_usage,
			purchased_balance: prepaidQuantity,
			current_balance: 0,
			usage: 600,
			overage_allowed: false,
		}),
	);

	expect(resAfterTrack1000.balance?.breakdown).toContainEqual(
		expect.objectContaining({
			granted_balance: usageItem.included_usage,
			purchased_balance: 200,
			current_balance: 0,
			usage: 400,
			max_purchase: maxPurchase,
			overage_allowed: true,
		}),
	);

	// ─────────────────────────────────────────────────────────────────
	// Track another 200: Only 100 actually used due to usage limit
	// Usage-based has max_purchase=300, already purchased 200, so only 100 more
	// ─────────────────────────────────────────────────────────────────

	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	const resAfterTrack1200 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resAfterTrack1200.balance).toMatchObject({
		usage: 1100, // Only 100 actually used due to cap
		purchased_balance: prepaidQuantity + 300,
	});

	expect(resAfterTrack1200.balance?.breakdown).toContainEqual(
		expect.objectContaining({
			granted_balance: usageItem.included_usage,
			purchased_balance: 300,
			current_balance: 0,
			usage: 500,
			max_purchase: maxPurchase,
			overage_allowed: true,
		}),
	);

	// ─────────────────────────────────────────────────────────────────
	// Verify skip_cache returns correct response (tests postgres sync)
	// ─────────────────────────────────────────────────────────────────

	await new Promise((resolve) => setTimeout(resolve, 4000));

	const resSkipCache = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	})) as unknown as CheckResponseV2;

	// Note: not asserting `allowed` here - the skip_cache test is primarily
	// verifying that postgres sync returns correct balance data
	expect(resSkipCache.balance).toMatchObject({
		granted_balance: grantedBalance,
		current_balance: 0,
		usage: 1100,
		purchased_balance: prepaidQuantity + 300,
	});

	expect(resSkipCache.balance?.breakdown).toContainEqual(
		expect.objectContaining({
			granted_balance: prepaidItem.included_usage,
			purchased_balance: prepaidQuantity,
			current_balance: 0,
			usage: 600,
			overage_allowed: false,
		}),
	);

	expect(resSkipCache.balance?.breakdown).toContainEqual(
		expect.objectContaining({
			granted_balance: usageItem.included_usage,
			purchased_balance: 300,
			current_balance: 0,
			usage: 500,
			max_purchase: maxPurchase,
			overage_allowed: true,
		}),
	);
});
