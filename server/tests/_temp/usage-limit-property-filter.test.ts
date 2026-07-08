/**
 * TDD test for `filter` on usage limits: a windowed hard cap that only counts
 * usage whose track-event properties match the filter (per-API-key caps).
 * Ticket: tickets/USAGE_LIMIT_PROPERTY_FILTER.md.
 *
 * Contract under test:
 *   New types/fields:
 *     - usage_limits[].filter?: { properties: Record<string, string> }
 *       Exact equality per key, AND across keys, values string-normalized.
 *       Echoed on customer responses; `usage` on a filtered entry is the
 *       filter-scoped window counter.
 *   New behaviors:
 *     - Track matching the filter -> counts toward + clamped by the cap.
 *     - Track with a different value / missing property -> applies in full,
 *       counter untouched.
 *     - Numeric event property matches its string filter value ("29384" == 29384).
 *     - Multi-key filter matches only when EVERY key matches.
 *     - Two filtered limits on one feature keep independent counters.
 *     - A filtered and an unfiltered limit on one feature enforce independently
 *       (unfiltered counts ALL usage, filtered only matching usage).
 *     - check takes `properties` and returns allowed: false when the matching
 *       filtered cap has no headroom; non-matching / absent properties are
 *       not gated by the filtered cap. (Ayush, todo thread 2026-07-08)
 *     - Credit-system dimension: a filtered cap on the credit feature counts
 *       credit drains from tracks on member features carrying matching
 *       properties (the SEARCH_CREDITS scenario). (Ayush, todo thread)
 *   Side effects:
 *     - Filtered counters mirror to Postgres (skip_cache read shows the same
 *       usage as the cached read).
 *
 * Pre-impl red: the `filter` field does not exist on DbUsageLimit (compile),
 * then enforcement ignores filters (value-layer reds).
 * Post-impl green: schema accepts + echoes filter, deduction path scopes the
 * window counter to matching tracks.
 */

import { expect, test } from "bun:test";
import {
	ApiVersion,
	type CustomerBillingControls,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerBalance,
	expectCustomerUsageLimit,
} from "../integration/balances/utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

/** Arms the given usage_limits entries (replaces the whole array). */
const setUsageLimits = async ({
	customerId,
	usageLimits,
}: {
	customerId: string;
	usageLimits: NonNullable<CustomerBillingControls["usage_limits"]>;
}) => {
	const billingControls: CustomerBillingControls = {
		usage_limits: usageLimits,
	};
	await timeout(2000);
	await autumnV2_3.customers.update(customerId, {
		billing_controls: billingControls,
	});
	await timeout(3000);
};

const messagesPlan = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

// ── Contract 1+2: matching tracks count + clamp; non-matching and
// property-less tracks pass through untouched ──────────────────────────────
test.concurrent(
	`${chalk.yellowBright("ul-filter1: filtered cap clamps matching tracks, ignores non-matching")}`,
	async () => {
		const customerId = "ul-filter-basic-1";
		const plan = messagesPlan("ul-filter-basic");
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await setUsageLimits({
			customerId,
			usageLimits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Month,
					filter: { properties: { apiKeyId: "key-a" } },
				},
			],
		});

		// Matching track consumes the cap in full.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
			properties: { apiKeyId: "key-a" },
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});

		// Cap exhausted: a further matching track clamps to 0.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
			properties: { apiKeyId: "key-a" },
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});

		// A DIFFERENT key applies in full and leaves the counter untouched.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 4,
			properties: { apiKeyId: "key-b" },
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 91,
			usage: 9,
		});

		// A track with NO properties also applies in full.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 89,
			usage: 11,
		});

		// Response echoes the filter and the filter-scoped usage.
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: { apiKeyId: "key-a" },
			usage: 5,
			limit: 5,
		});
	},
);

// ── Contract 5: two filtered limits on one feature keep independent
// counters and clamp independently ──────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("ul-filter2: two filtered limits on one feature enforce independently")}`,
	async () => {
		const customerId = "ul-filter-independent-1";
		const plan = messagesPlan("ul-filter-independent");
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await setUsageLimits({
			customerId,
			usageLimits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Month,
					filter: { properties: { apiKeyId: "key-a" } },
				},
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 3,
					interval: ResetInterval.Month,
					filter: { properties: { apiKeyId: "key-b" } },
				},
			],
		});

		// Exhaust key-b's cap; key-a's counter must not move.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
			properties: { apiKeyId: "key-b" },
		});
		// key-b clamped to 0 now; key-a still has full headroom.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
			properties: { apiKeyId: "key-b" },
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 4,
			properties: { apiKeyId: "key-a" },
		});

		// Applied: 3 (key-b) + 0 (key-b clamped) + 4 (key-a) = 7.
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 93,
			usage: 7,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: { apiKeyId: "key-a" },
			usage: 4,
			limit: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: { apiKeyId: "key-b" },
			usage: 3,
			limit: 3,
		});
	},
);

// ── Contract 6: a filtered and an unfiltered limit coexist -- the unfiltered
// cap counts ALL usage, the filtered one only its slice ─────────────────────
test.concurrent(
	`${chalk.yellowBright("ul-filter3: filtered cap coexists with an unfiltered cap on the same feature")}`,
	async () => {
		const customerId = "ul-filter-coexist-1";
		const plan = messagesPlan("ul-filter-coexist");
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await setUsageLimits({
			customerId,
			usageLimits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 10,
					interval: ResetInterval.Month,
				},
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Month,
					filter: { properties: { apiKeyId: "key-a" } },
				},
			],
		});

		// key-a hits its filtered cap at 5; the unfiltered counter also reads 5.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
			properties: { apiKeyId: "key-a" },
		});
		// Over the filtered cap: clamps to 0 even though the unfiltered cap has room.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
			properties: { apiKeyId: "key-a" },
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});

		// key-b usage counts toward the unfiltered cap only: 5 more exhausts it.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
			properties: { apiKeyId: "key-b" },
		});
		// Unfiltered cap exhausted: key-b clamps to 0 despite having no filtered cap.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
			properties: { apiKeyId: "key-b" },
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 90,
			usage: 10,
		});

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: { apiKeyId: "key-a" },
			usage: 5,
			limit: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: null,
			usage: 10,
			limit: 10,
		});
	},
);

// ── Contract 3: numeric event property matches its string filter value ──────
test.concurrent(
	`${chalk.yellowBright("ul-filter4: numeric event property matches string filter value")}`,
	async () => {
		const customerId = "ul-filter-coerce-1";
		const plan = messagesPlan("ul-filter-coerce");
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await setUsageLimits({
			customerId,
			usageLimits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Month,
					filter: { properties: { apiKeyId: "29384" } },
				},
			],
		});

		// The event sends the key as a NUMBER; it must still match "29384".
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
			properties: { apiKeyId: 29384 },
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
			properties: { apiKeyId: 29384 },
		});

		// A different numeric key is NOT gated (proves the coerced match is
		// value-specific, not filter-ignored clamping).
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 4,
			properties: { apiKeyId: 99999 },
		});

		// Cap engaged for 29384 only: 5 applied + 2 clamped + 4 uncapped.
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 91,
			usage: 9,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: { apiKeyId: "29384" },
			usage: 5,
			limit: 5,
		});
	},
);

// ── Contract 4: multi-key filter is AND -- all keys must match ──────────────
test.concurrent(
	`${chalk.yellowBright("ul-filter5: multi-key filter only matches when every key matches")}`,
	async () => {
		const customerId = "ul-filter-and-1";
		const plan = messagesPlan("ul-filter-and");
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await setUsageLimits({
			customerId,
			usageLimits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Month,
					filter: { properties: { apiKeyId: "key-a", env: "prod" } },
				},
			],
		});

		// Partial match (env differs): not counted, applies in full.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 4,
			properties: { apiKeyId: "key-a", env: "dev" },
		});
		// Full match: counted and clamped at the cap.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
			properties: { apiKeyId: "key-a", env: "prod" },
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
			properties: { apiKeyId: "key-a", env: "prod" },
		});

		// Applied: 4 (partial, uncapped) + 5 (matched) + 0 (clamped) = 9.
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 91,
			usage: 9,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: { apiKeyId: "key-a", env: "prod" },
			usage: 5,
			limit: 5,
		});
	},
);

// ── Side effect: the filtered counter survives a cache-skipping read (PG
// mirror), so cache invalidation cannot reset the cap ────────────────────────
test.concurrent(
	`${chalk.yellowBright("ul-filter6: filtered counter persists to Postgres (skip_cache read)")}`,
	async () => {
		const customerId = "ul-filter-persist-1";
		const plan = messagesPlan("ul-filter-persist");
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await setUsageLimits({
			customerId,
			usageLimits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Month,
					filter: { properties: { apiKeyId: "key-a" } },
				},
			],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
			properties: { apiKeyId: "key-a" },
		});
		// Non-matching usage must not be in the persisted counter either.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
			properties: { apiKeyId: "key-b" },
		});

		// Allow the write-behind sync to land, then read through to Postgres.
		// The batch flush debounce is ~4-5s; a 4s wait races it under load.
		await timeout(9000);
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: { apiKeyId: "key-a" },
			usage: 3,
			limit: 5,
			skipCache: true,
		});
	},
);

// ── Contract: check takes properties and is gated by the MATCHING filtered
// cap only ──────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("ul-filter7: check with properties returns allowed:false when the matching filtered cap is exhausted")}`,
	async () => {
		const customerId = "ul-filter-check-1";
		const plan = messagesPlan("ul-filter-check");
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await setUsageLimits({
			customerId,
			usageLimits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Month,
					filter: { properties: { apiKeyId: "key-a" } },
				},
			],
		});

		// Exhaust key-a's cap.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
			properties: { apiKeyId: "key-a" },
		});

		// Matching properties: the exhausted filtered cap denies access.
		const matching = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
			properties: { apiKeyId: "key-a" },
		});
		expect(matching.allowed).toBe(false);

		// A different key is not gated by key-a's cap.
		const otherKey = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
			properties: { apiKeyId: "key-b" },
		});
		expect(otherKey.allowed).toBe(true);

		// No properties at all: filtered caps do not apply.
		const noProperties = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
		});
		expect(noProperties.allowed).toBe(true);
	},
);

// ── Contract: credit-system dimension -- a filtered cap on the CREDIT
// feature counts drains from member-feature tracks with matching properties
// (1 action1 = 0.2 credits; the SEARCH_CREDITS scenario) ────────────────────
test.concurrent(
	`${chalk.yellowBright("ul-filter8: filtered credit cap counts credit drains from member-feature tracks")}`,
	async () => {
		const customerId = "ul-filter-credits-1";
		const plan = products.base({
			id: "ul-filter-credits",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await setUsageLimits({
			customerId,
			usageLimits: [
				{
					feature_id: TestFeature.Credits,
					enabled: true,
					limit: 1,
					interval: ResetInterval.Day,
					filter: { properties: { apiKeyId: "key-a" } },
				},
			],
		});

		// 5 action1 = exactly 1 credit: key-a's credit window is now exhausted.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
			properties: { apiKeyId: "key-a" },
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			remaining: 99,
			usage: 1,
		});

		// A further key-a track clamps to 0 despite ~99 credits remaining.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
			properties: { apiKeyId: "key-a" },
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			remaining: 99,
			usage: 1,
		});

		// key-b drains credits freely -- the filtered credit counter is untouched.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
			properties: { apiKeyId: "key-b" },
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			remaining: 98,
			usage: 2,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			filterProperties: { apiKeyId: "key-a" },
			usage: 1,
			limit: 1,
		});
	},
);
