import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import {
	ApiVersion,
	type CustomerBillingControls,
	ResetInterval,
} from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectUsageLimitCorrect } from "@tests/integration/utils/expectUsageLimitCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	expectCustomerBalance,
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

// Usage-window ENFORCEMENT: what a track actually applies under a windowed
// cap (the deduction-script path). Covers both cap dimensions --
// metered_feature (cap counts tracked units) and balance (cap counts credits
// drained) -- including credit conversion, multi-cusEnt deductions, the
// compound overage_limit case, and concurrency.

// initScenario only exposes clients up to V2_2; build the latest-version client
// directly (same pattern as the v2.2-vs-v2.3 parity tests).
const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// Credit system: 100 credits, 1 action1 = 0.2 credits (see v2Features.ts).
// A cap of 5 action1 units consumes only 1 credit, so the cap must clamp the
// 6th unit while ~99 credits remain, proving it's a second, independent
// dimension, not a balance check.
test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement1: metered cap clamps the over-cap unit while credits remain")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-metered",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-enforce-metered-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		// Consume exactly up to the cap: 5 action1 units = 1 credit deducted.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});

		// The 6th unit is over the cap, so it clamps to 0: the track succeeds but
		// applies nothing, leaving credits unchanged.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			usage: 5,
			limit: 5,
		});
	},
);

// An over-cap track applies what fits (the remaining headroom) instead of
// rejecting the whole track. cap 5, track 10 from 0 -> applies 5 (not 10, not
// a 400).
test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement2: over-cap track applies what fits (clamp, not reject)")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-clamp",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-enforce-clamp-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		// Track 10 against a cap of 5 (from 0): clamps to 5, returns 200, not a reject.
		const clamped = await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		expect(clamped.value).toBe(10);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});

		// At the cap: a further track applies 0 (fully clamped), still 200.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});
	},
);

// Metered cap with TWO credits cusEnts (monthly + lifetime): the clamped
// deduction must drain the monthly bucket first, spill exactly 1 credit into
// lifetime, and stop there. 1 action1 = 0.2 credits, so the 10-unit cap is
// worth exactly 2 credits.
test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement3: metered cap clamps across monthly then lifetime credits cusEnts")}`,
	async () => {
		const monthlyCreditsItem = items.monthlyCredits({ includedUsage: 1 });
		const lifetimeCreditsItem = constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 10,
			interval: null,
		});
		const freePlan = products.base({
			id: "uw-enforce-metered-multi",
			items: [monthlyCreditsItem, lifetimeCreditsItem],
		});

		const customerId = "uw-enforce-metered-multi-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			limit: 10,
		});

		// Track 15 action1 against a 10/month cap: clamps to 10 units = 2 credits.
		// 1 credit drains the monthly cusEnt, 1 comes out of lifetime.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 15,
		});

		const afterClamp =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterClamp,
			featureId: TestFeature.Credits,
			granted: 11,
			remaining: 9,
			usage: 2,
			breakdown: {
				[ResetInterval.Month]: {
					included_grant: 1,
					remaining: 0,
					usage: 1,
				},
				[ResetInterval.OneOff]: {
					included_grant: 10,
					remaining: 9,
					usage: 1,
				},
			},
		});

		// At the cap: a further track applies 0, so lifetime credits stay put.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		const atCap = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: atCap,
			featureId: TestFeature.Credits,
			granted: 11,
			remaining: 9,
			usage: 2,
			breakdown: {
				[ResetInterval.Month]: { remaining: 0, usage: 1 },
				[ResetInterval.OneOff]: { remaining: 9, usage: 1 },
			},
		});
		expectUsageLimitCorrect({
			customer: atCap,
			featureId: TestFeature.Action1,
			usage: 10,
			limit: 10,
		});
	},
);

// Balance-dim cap: the cap is denominated in CREDITS (cap on the credit pool
// itself), enforced while monthly credits remain.
test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement4: balance cap (1 credit/day) clamps while monthly credits remain")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-balance",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-enforce-balance-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		// 1 action1 = 0.2 credits, so 5 action1 = exactly 1 credit (the daily cap).
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 1,
			interval: ResetInterval.Day,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});

		// The credit-pool window is exhausted: the next track clamps to 0 (the
		// window shortfall flows through the standard 'cap' overage behaviour),
		// leaving the ~99 remaining monthly credits untouched.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 1,
			limit: 1,
		});
	},
);

// Balance-dim cap with TWO credits cusEnts: credits drained from BOTH must
// count toward the window. (The old entitlement-anchored counter only saw the
// anchor cusEnt's drain, silently under-counting multi-cusEnt consumption.)
test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement5: balance cap counts drains across monthly and lifetime cusEnts")}`,
	async () => {
		const monthlyCreditsItem = items.monthlyCredits({ includedUsage: 1 });
		const lifetimeCreditsItem = constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 10,
			interval: null,
		});
		const freePlan = products.base({
			id: "uw-enforce-balance-multi",
			items: [monthlyCreditsItem, lifetimeCreditsItem],
		});

		const customerId = "uw-enforce-balance-multi-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		// Cap the credit pool at 2/day. 1 action1 = 0.2 credits, so 10 action1 =
		// 2 credits: 1 drains the monthly cusEnt, 1 spills into lifetime. Both
		// drains must land on the same customer-level counter.
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 2,
			interval: ResetInterval.Day,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 10,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 11,
			remaining: 9,
			usage: 2,
		});

		// The counter saw the full 2 credits (1 monthly + 1 lifetime), so the cap
		// is exhausted: the next consumption clamps to 0 instead of being served
		// from the 9 remaining lifetime credits.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		const afterClamp =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterClamp,
			featureId: TestFeature.Credits,
			granted: 11,
			remaining: 9,
			usage: 2,
		});

		// usage is served from the customer-scoped counter.
		expectUsageLimitCorrect({
			customer: afterClamp,
			featureId: TestFeature.Credits,
			usage: 2,
			limit: 2,
		});
	},
);

// An overage spend_limit and a usage limit on the SAME feature are separate
// billing controls that coexist: the window must still clamp on its own.
test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement6: a usage limit clamps alongside an overage spend_limit on the same feature")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-compound",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-enforce-compound-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		const billingControls: CustomerBillingControls = {
			spend_limits: [
				{
					feature_id: TestFeature.Action1,
					enabled: true,
					overage_limit: 20,
				},
			],
			usage_limits: [
				{
					feature_id: TestFeature.Action1,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Month,
				},
			],
		};
		await timeout(2000);
		await autumnV2_3.customers.update(customerId, {
			billing_controls: billingControls,
		});
		await timeout(3000);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		// The window cap clamps the over-cap unit to 0 (the overage path is separate),
		// so the track succeeds and credits are unchanged.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			remaining: 99,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			usage: 5,
			limit: 5,
		});
	},
);

// Two concurrent tracks on the SAME customer's SAME window must serialize
// (Redis runs each deduction Lua atomically): combined value exceeds the cap,
// so the second track clamps and the counter reflects exactly the capped usage.
test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement7: concurrent tracks on one window serialize, total clamped to the cap")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-concurrent",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `uw-enforce-concurrent-${Date.now()}`;
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		// Cap action1 at 5/month; two concurrent tracks of 5 each => combined 10 > 5.
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		const results = await Promise.allSettled([
			autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 5,
			}),
			autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 5,
			}),
		]);

		// Both succeed (clamp, not reject), but the window clamps the combined
		// applied usage to the cap: one applies 5, the other clamps to 0.
		expect(results.every((result) => result.status === "fulfilled")).toBe(true);

		await timeout(2000);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			remaining: 99,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			usage: 5,
			limit: 5,
		});

		// BOTH tracks record events (clamped tracks too, matching how
		// balance-clamped tracks have always behaved): events reflect requests.
		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: 5 }, { value: 5 }],
		});
	},
);

// Metered cap funded by MIXED entitlements: a native action1 cusEnt AND a
// credits cusEnt (different conversion rates in one deduction). Deduction
// order is native-first (see track-credit-system3), so a clamped track of 10
// against cap 8 drains the 5 native units, then 3 units via credits at 0.2
// credits/unit -- the counter must see all 8 tracked units across both.
test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement8: metered cap counts units across native and credit-system cusEnts")}`,
	async () => {
		const action1Item = items.free({
			featureId: TestFeature.Action1,
			includedUsage: 5,
		});
		const creditsItem = items.monthlyCredits({ includedUsage: 100 });
		const freePlan = products.base({
			id: "uw-enforce-mixed",
			items: [action1Item, creditsItem],
		});

		const customerId = "uw-enforce-mixed-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			limit: 8,
		});

		// Track 10 against cap 8: applies 8 -- the native pool's 5 units, then 3
		// units from credits (3 x 0.2 = 0.6 credits).
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 10,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			granted: 5,
			remaining: 0,
			usage: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99.4,
			usage: 0.6,
		});

		// The counter saw all 8 units (5 native + 3 credit-funded): exhausted, so
		// a further track clamps to 0 despite the 99.4 remaining credits.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		const atCap = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: atCap,
			featureId: TestFeature.Credits,
			remaining: 99.4,
			usage: 0.6,
		});

		expectUsageLimitCorrect({
			customer: atCap,
			featureId: TestFeature.Action1,
			usage: 8,
			limit: 8,
		});
	},
);

// A cap counts ITS OWN dimension: a metered cap on action1 must neither gate
// nor be incremented by tracking the credits feature directly, even when the
// cap is fully exhausted.
test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement9: an action1 cap does not touch direct credits tracking")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-scope",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-enforce-scope-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		// Exhaust the action1 cap (5 units = 1 credit).
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		// Direct credits tracking applies IN FULL: no clamp from the action1 cap...
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 10,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 89,
			usage: 11,
		});

		// ...and the action1 counter never moved.
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			usage: 5,
			limit: 5,
		});
	},
);
