/**
 * TDD test for `aggregate_on: "deducted"` on POST /v1/events.aggregate — a per-balance
 * breakdown of what each tracked event actually consumed, so an org can see when a feature
 * falls off its allowance into credits, and can attribute shared-pool spend back to the entity
 * that made the call.
 *
 * Contract under test:
 *   New request params (shared/api/events/aggregate/eventsAggregateParams.ts):
 *     - aggregate_on?: "deducted"   presence adds `deductions` to the response; absence changes nothing
 *     - feature_id                  existing param, widened: matches if the TRACKED feature is X
 *                                   OR the BALANCE's feature is X. Stays optional.
 *     - validation                  customer_id is REQUIRED when aggregate_on is set ->
 *                                   RecaseError(ErrCode.InvalidRequest, 400)
 *
 *   New response field (eventsAggregateResponseV1.ts), present ONLY when aggregate_on is set:
 *     deductions: Array<{
 *       period: number                                  // epoch ms, same basis as list[]
 *       values: Record<feature_id, {
 *         feature_type: "metered" | "credit_system"
 *         deducted: number
 *         events: number
 *         balances: Array<{
 *           balance_id: string
 *           entity_id: string | null                    // null = customer-level, shared
 *           plan_id: string | null
 *           reset: { interval: string; resets_at: number | null } | null
 *           credit_cost: number | null                  // null when 1:1
 *           deducted: number
 *           events: number
 *         }>
 *       }>
 *       grouped_values?: Record<balance_id, Record<group_value, {
 *         deducted: number
 *         credit_cost?: number | null
 *       }>>                                             // omitted when group_by is absent
 *     }>
 *
 *   New behaviours:
 *     - track a feature past its own allowance -> two entries in values{}: the feature's own
 *       metered balance, and the credit system it spilled into, with credit_cost on the latter
 *     - group_by "$entity_id" -> grouped_values splits a customer-level balance by the EVENT's
 *       entity, which is the only thing that can attribute shared-pool spend to a member
 *     - group_by "properties.<key>" -> grouped_values splits each balance by the event
 *       property; served from raw `events` (the MV carries no properties), bounded by
 *       the mandatory customer_id leading the events sorting key
 *     - aggregate_on absent -> no `deductions` key at all; list/total byte-identical
 *     - aggregate_on set with no customer_id -> 400
 *
 *   Side effects: none. Read-only endpoint.
 *
 *   Resolved server-side rather than from Tinybird (the MV does not carry them):
 *     - feature_type            from ctx.features by balance feature id
 *     - credit_cost             from the credit system's config.schema (CURRENT schema, not the
 *                               rate at deduction time — accepted caveat, credit systems are not versioned)
 *     - balances[].entity_id    from the customer's entitlements by balance_id
 *
 * Pre-impl red: every assertion fails at the request-validation layer — `aggregate_on` is not in
 *   EventsAggregateParamsSchema, so the param is stripped and `deductions` is never returned.
 * Post-impl green: all assertions pass once the param, the aggregateDeductions action (pipe call
 *   + pivot), and the handler wiring exist.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

// TestFeature.Credits is a credit system over Action1 (0.2 credits each) and Action2 (0.6).
const ACTION1_CREDIT_COST = 0.2;

const EVENT_INGEST_TIMEOUT_MS = 40_000;
const POLL_INTERVAL_MS = 3_000;

type DeductionBalance = {
	balance_id: string;
	entity_id: string | null;
	plan_id: string | null;
	reset: { interval: string; resets_at: number | null } | null;
	credit_cost: number | null;
	deducted: number;
	events: number;
};

type DeductionFeature = {
	feature_type: "metered" | "credit_system";
	deducted: number;
	events: number;
	balances: DeductionBalance[];
};

type DeductionPeriod = {
	period: number;
	values: Record<string, DeductionFeature>;
	grouped_values?: Record<
		string,
		Record<string, { deducted: number; credit_cost?: number | null }>
	>;
};

type AggregateResponse = {
	list: {
		period: number;
		values: Record<string, number>;
		grouped_values?: Record<string, Record<string, number>>;
	}[];
	total: Record<string, { count: number; sum: number }>;
	deductions?: DeductionPeriod[];
};

/** Sums one feature's `deducted` across every period. */
const sumDeducted = (response: AggregateResponse, featureId: string): number =>
	(response.deductions ?? []).reduce(
		(sum, period) => sum + (period.values[featureId]?.deducted ?? 0),
		0,
	);

/** First period entry that actually carries a value for the feature. */
const findFeature = (
	response: AggregateResponse,
	featureId: string,
): DeductionFeature | undefined =>
	(response.deductions ?? []).find((p) => p.values[featureId])?.values[
		featureId
	];

/** Polls until Tinybird has the deductions, so a red is never just ingest lag. */
const pollUntilDeducted = async ({
	fetchResponse,
	featureId,
	expected,
}: {
	fetchResponse: () => Promise<AggregateResponse>;
	featureId: string;
	expected: number;
}): Promise<AggregateResponse> => {
	const deadline = Date.now() + EVENT_INGEST_TIMEOUT_MS;
	let response: AggregateResponse;
	do {
		await timeout(POLL_INTERVAL_MS);
		response = await fetchResponse();
	} while (
		Date.now() < deadline &&
		Math.abs(sumDeducted(response, featureId) - expected) > 0.0001
	);
	return response;
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. ALLOWANCE -> CREDITS — a feature falls off its own allowance into a credit system
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("aggregate deductions: a feature past its allowance splits across its own balance and the credit pool")}`,
	async () => {
		// Unique per run — Tinybird keeps tracked events after the customer is deleted.
		const customerId = `agg-deductions-spill-${Date.now()}`;
		const ACTION1_ALLOWANCE = 10;
		const TRACKED = 25;
		const OVERFLOW = TRACKED - ACTION1_ALLOWANCE; // 15
		const EXPECTED_CREDITS = OVERFLOW * ACTION1_CREDIT_COST; // 3

		const prod = products.base({
			id: "spill",
			items: [
				constructFeatureItem({
					featureId: TestFeature.Action1,
					includedUsage: ACTION1_ALLOWANCE,
				}),
				items.monthlyCredits({ includedUsage: 100 }),
			],
		});

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod], prefix: customerId }),
			],
			actions: [s.attach({ productId: prod.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: TRACKED,
			// Exercised by the properties.* grouping assertion at the end.
			properties: { region: "us-east" },
		});

		const response = await pollUntilDeducted({
			featureId: TestFeature.Credits,
			expected: EXPECTED_CREDITS,
			fetchResponse: async () =>
				(await autumnV2_2.events.aggregate({
					customer_id: customerId,
					feature_id: TestFeature.Action1,
					aggregate_on: "deducted",
					range: "7d",
				})) as AggregateResponse,
		});

		// ── Contract: `deductions` exists when aggregate_on is set ───────────────
		expect(response.deductions).toBeDefined();
		expect(Array.isArray(response.deductions)).toBe(true);
		expect(response.deductions?.length).toBeGreaterThan(0);

		// ── Contract: `list` and `total` are untouched by aggregate_on ───────────
		expect(response.total[TestFeature.Action1]?.sum).toBe(TRACKED);
		expect(response.list.length).toBeGreaterThan(0);

		// ── Contract: two entries in values{}, keyed by the balance-owning feature ─
		const ownMeter = findFeature(response, TestFeature.Action1);
		const creditPool = findFeature(response, TestFeature.Credits);

		expect(ownMeter, "own metered balance missing from values{}").toBeDefined();
		expect(creditPool, "credit system missing from values{}").toBeDefined();

		// ── Contract: feature_type distinguishes allowance from credits ──────────
		expect(ownMeter?.feature_type).toBe("metered");
		expect(creditPool?.feature_type).toBe("credit_system");

		// ── Contract: the split amounts ──────────────────────────────────────────
		// Allowance absorbs what it can, remainder converts at the schema rate.
		expect(ownMeter?.deducted).toBe(ACTION1_ALLOWANCE);
		expect(creditPool?.deducted).toBeCloseTo(EXPECTED_CREDITS, 6);

		// ── Contract: one event contributed to both balances ─────────────────────
		expect(ownMeter?.events).toBe(1);
		expect(creditPool?.events).toBe(1);

		// ── Contract: balances[] shape ───────────────────────────────────────────
		const meterBalance = ownMeter?.balances?.[0];
		const creditBalance = creditPool?.balances?.[0];

		expect(ownMeter?.balances).toHaveLength(1);
		expect(creditPool?.balances).toHaveLength(1);

		expect(typeof meterBalance?.balance_id).toBe("string");
		expect(meterBalance?.balance_id).toStartWith("cus_ent_");

		// Customer-level balances carry no entity.
		expect(meterBalance?.entity_id).toBeNull();
		expect(creditBalance?.entity_id).toBeNull();

		// Both balances came from the attached plan.
		expect(meterBalance?.plan_id).toBe(prod.id);
		expect(creditBalance?.plan_id).toBe(prod.id);

		// ── Contract: reset is captured at deduction time ────────────────────────
		expect(meterBalance?.reset?.interval).toBe("month");
		expect(typeof meterBalance?.reset?.resets_at).toBe("number");

		// ── Contract: credit_cost is null for 1:1, the schema rate otherwise ─────
		expect(meterBalance?.credit_cost).toBeNull();
		expect(creditBalance?.credit_cost).toBeCloseTo(ACTION1_CREDIT_COST, 6);

		// ── Contract: per-balance amounts equal the feature totals here ──────────
		expect(meterBalance?.deducted).toBe(ACTION1_ALLOWANCE);
		expect(creditBalance?.deducted).toBeCloseTo(EXPECTED_CREDITS, 6);

		// ── Contract: grouped_values is omitted when group_by is absent ──────────
		expect(response.deductions?.[0]?.grouped_values).toBeUndefined();

		// ── Contract: period is epoch ms, same basis as list[] ───────────────────
		expect(typeof response.deductions?.[0]?.period).toBe("number");
		expect(response.deductions?.[0]?.period).toBeGreaterThan(1_600_000_000_000);

		// ── Contract: group_by "properties.*" splits each balance by the event ───
		// property. Served from RAW events (the MV carries no properties by
		// design), which is bounded because customer_id is mandatory and leads
		// the events sorting key.
		const propertyGrouped = (await autumnV2_2.events.aggregate({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			aggregate_on: "deducted",
			group_by: "properties.region",
			range: "7d",
		})) as AggregateResponse;

		const propertyMeter = findFeature(propertyGrouped, TestFeature.Action1);
		const propertyCredit = findFeature(propertyGrouped, TestFeature.Credits);
		expect(
			propertyMeter,
			"metered balance missing under property grouping",
		).toBeDefined();
		expect(
			propertyCredit,
			"credit balance missing under property grouping",
		).toBeDefined();

		const splitFor = (balanceId?: string) =>
			(propertyGrouped.deductions ?? [])
				.map((period) => period.grouped_values?.[balanceId ?? ""])
				.find(Boolean);

		const meterSplit = splitFor(propertyMeter?.balances?.[0]?.balance_id);
		const creditSplit = splitFor(propertyCredit?.balances?.[0]?.balance_id);

		// Every deduction came from a single "us-east" event, so each balance's
		// split has exactly that one key carrying the full amount.
		expect(meterSplit?.["us-east"]?.deducted).toBe(ACTION1_ALLOWANCE);
		expect(creditSplit?.["us-east"]?.deducted).toBeCloseTo(EXPECTED_CREDITS, 6);
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. SHARED POOL — attribute a customer-level balance to each entity that spent from it
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("aggregate deductions: group_by $entity_id splits a shared balance by which entity spent")}`,
	async () => {
		const customerId = `agg-deductions-entity-${Date.now()}`;
		const ENT_1_TRACKED = 5;
		const ENT_2_TRACKED = 10;
		const ENT_1_CREDITS = ENT_1_TRACKED * ACTION1_CREDIT_COST; // 1
		const ENT_2_CREDITS = ENT_2_TRACKED * ACTION1_CREDIT_COST; // 2

		// No Action1 balance on the plan, so every track lands straight on the
		// customer-level credit pool — the shared-pool case.
		const prod = products.base({
			id: "shared-pool",
			items: [
				items.monthlyUsers({ includedUsage: 5 }),
				items.monthlyCredits({ includedUsage: 100 }),
			],
		});

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod], prefix: customerId }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: prod.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: "ent-1",
			feature_id: TestFeature.Action1,
			value: ENT_1_TRACKED,
		});
		await autumnV1.track({
			customer_id: customerId,
			entity_id: "ent-2",
			feature_id: TestFeature.Action1,
			value: ENT_2_TRACKED,
		});

		const response = await pollUntilDeducted({
			featureId: TestFeature.Credits,
			expected: ENT_1_CREDITS + ENT_2_CREDITS,
			fetchResponse: async () =>
				(await autumnV2_2.events.aggregate({
					customer_id: customerId,
					feature_id: TestFeature.Credits,
					aggregate_on: "deducted",
					group_by: "$entity_id",
					range: "7d",
				})) as AggregateResponse,
		});

		const creditPool = findFeature(response, TestFeature.Credits);
		expect(creditPool, "credit system missing from values{}").toBeDefined();

		// ── Contract: both entities drew on ONE shared balance ───────────────────
		expect(creditPool?.balances).toHaveLength(1);
		const sharedBalance = creditPool?.balances?.[0];
		expect(sharedBalance?.entity_id).toBeNull(); // customer-level, not entity-owned
		expect(creditPool?.deducted).toBeCloseTo(ENT_1_CREDITS + ENT_2_CREDITS, 6);
		expect(creditPool?.events).toBe(2);

		// ── Contract: grouped_values is keyed by balance_id, then group value ────
		const period = response.deductions?.find(
			(p) => p.grouped_values?.[sharedBalance?.balance_id ?? ""],
		);
		expect(
			period,
			"no period carries grouped_values for the shared balance",
		).toBeDefined();

		const split = period?.grouped_values?.[sharedBalance?.balance_id ?? ""];
		expect(split).toBeDefined();

		// ── Contract: the split is by the EVENT's entity, not the balance's ──────
		// The balance has no entity of its own; only the event knows who spent.
		expect(split?.["ent-1"]?.deducted).toBeCloseTo(ENT_1_CREDITS, 6);
		expect(split?.["ent-2"]?.deducted).toBeCloseTo(ENT_2_CREDITS, 6);

		// ── Contract: credit_cost rides along inside grouped_values ──────────────
		// Not asserted per-group here: grouping is by entity, not source feature, so
		// the rate is a property of the balance rather than the group. See test 1.
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// 3. VALIDATION — customer_id is required in deducted mode
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("aggregate deductions: aggregate_on without customer_id is rejected 400")}`,
	async () => {
		const customerId = `agg-deductions-validation-${Date.now()}`;
		const prod = products.base({
			id: "validation",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod], prefix: customerId }),
			],
			actions: [s.attach({ productId: prod.id })],
		});

		// ── Contract: org-wide deducted queries are rejected, not a full scan ────
		// AutumnError carries only { message, code } — the CLI drops the HTTP
		// status — so the 400 is asserted through the propagated error code.
		let threw = false;
		let code: string | undefined;
		let message: string | undefined;
		try {
			await autumnV2_2.events.aggregate({
				feature_id: TestFeature.Credits,
				aggregate_on: "deducted",
				range: "7d",
			});
		} catch (error) {
			threw = true;
			const e = error as { code?: string; message?: string };
			code = e.code;
			message = e.message;
		}

		expect(threw, "aggregate_on without customer_id should be rejected").toBe(
			true,
		);
		expect(code).toBe("invalid_request");
		expect(message).toContain("customer_id is required");
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// 4. ADDITIVE — the default response is untouched
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("aggregate deductions: omitting aggregate_on returns no deductions key at all")}`,
	async () => {
		const customerId = `agg-deductions-additive-${Date.now()}`;
		const TRACKED = 7;

		const prod = products.base({
			id: "additive",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod], prefix: customerId }),
			],
			actions: [s.attach({ productId: prod.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: TRACKED,
		});

		const deadline = Date.now() + EVENT_INGEST_TIMEOUT_MS;
		let response: AggregateResponse;
		do {
			await timeout(POLL_INTERVAL_MS);
			response = (await autumnV2_2.events.aggregate({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				range: "7d",
			})) as AggregateResponse;
		} while (
			Date.now() < deadline &&
			(response.total[TestFeature.Action1]?.sum ?? 0) !== TRACKED
		);

		// ── Contract: no aggregate_on -> no deductions key ───────────────────────
		expect(response.deductions).toBeUndefined();

		// ── Contract: list and total behave exactly as before ────────────────────
		expect(response.total[TestFeature.Action1]?.sum).toBe(TRACKED);
		expect(response.list.length).toBeGreaterThan(0);
	},
);
