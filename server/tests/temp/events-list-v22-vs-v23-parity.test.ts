/**
 * Temporary parity test: V2.3 cursor `events/list` must produce the same event
 * payload as V2.2 offset `events/list` for the same customer, modulo the
 * envelope difference (`next_cursor` vs `offset/has_more/total`).
 *
 * Why: V2.3 introduces cursor-based pagination via a new Tinybird pipe
 * (`list_events_cursor`) plus a new `eventActions.listByCursor` action. The
 * V2.2 path continues to use the offset pipe (`list_events_paginated`) and
 * `eventActions.listEvents` unchanged. Both paths read from the same MV
 * (`events_by_timestamp_mv`) and must agree on what events exist for a given
 * customer.
 *
 * Test flow:
 *   1. Attach a free product to a fresh customer.
 *   2. Track 5 events with distinct values + properties so we have enough rows
 *      to exercise pagination and verify field-level equality.
 *   3. Wait for the EventBatchingManager flush (~350ms) + Tinybird ingest.
 *   4. Call `events/list` against both V2.2 and V2.3 in parallel.
 *   5. Assert the `list[]` payloads deep-equal each other.
 *   6. Assert V2.3 returns a `next_cursor` field (string | null) and V2.2
 *      returns the offset envelope fields (`has_more`, `total`, `offset`,
 *      `limit`).
 *   7. Verify V2.3 cursor pagination round-trip: fetch page 1 with limit 2,
 *      follow the cursor to page 2, and confirm no event id is repeated.
 *
 * This test lives in `server/tests/temp/` because it is a one-shot
 * verification — once the V2.3 cursor flow has bake time in prod, it can
 * either be promoted into the regression suite or deleted.
 */

import { expect, test } from "bun:test";
import {
	type ApiEventsListItem,
	type ApiEventsListResponse,
	ApiVersion,
	type CursorPaginatedResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

// Deep diff helper — lifted from `list-customers-v22-vs-v23-parity.test.ts`.
// Returns a human-readable path to the first divergence, or null if equal.
const findDiff = (a: unknown, b: unknown, path = "$"): string | null => {
	if (a === b) return null;
	if (a === null || b === null || a === undefined || b === undefined) {
		return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
	}
	if (typeof a !== typeof b) {
		return `${path}: type ${typeof a} vs ${typeof b}`;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) {
			return `${path}: array vs non-array`;
		}
		if (a.length !== b.length) {
			return `${path}.length: ${a.length} vs ${b.length}`;
		}
		for (let i = 0; i < a.length; i++) {
			const d = findDiff(a[i], b[i], `${path}[${i}]`);
			if (d) return d;
		}
		return null;
	}
	if (typeof a === "object") {
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
		for (const k of keys) {
			const d = findDiff(aObj[k], bObj[k], `${path}.${k}`);
			if (d) return d;
		}
		return null;
	}
	return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
};

// Tinybird ingest + EventBatchingManager flush. 3s matches what
// `track-deductions-G` uses for the same scenario.
const TINYBIRD_INGEST_WAIT_MS = 3000;

const SEED_EVENT_COUNT = 5;

test.concurrent(`${chalk.yellowBright("events-list-v22-vs-v23-parity: V2.2 offset and V2.3 cursor return identical list[] for the same customer")}`, async () => {
	const messagesItem = items.free({
		featureId: TestFeature.Messages,
		includedUsage: 1000,
	});
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	// Static prefix + per-run timestamp so accumulated Tinybird state
	// from prior runs doesn't contaminate the assertions.
	const { customerId, autumnV2_2 } = await initScenario({
		customerId: `events-list-v22-v23-parity-${Date.now()}`,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Seed events sequentially so each has a strictly monotonic timestamp.
	// We deliberately use distinct values per event to make the diff failure
	// mode obvious when divergence happens.
	for (let i = 0; i < SEED_EVENT_COUNT; i++) {
		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: i + 1,
		});
	}

	// Let the batch flush + Tinybird ingest settle.
	await timeout(TINYBIRD_INGEST_WAIT_MS);

	// Two clients — same secret key (from env), different x-api-version
	// header. AutumnInt picks up UNIT_TEST_AUTUMN_SECRET_KEY automatically.
	const autumnV22 = new AutumnInt({ version: ApiVersion.V2_2 });
	const autumnV23 = new AutumnInt({ version: ApiVersion.V2_3 });

	// Pass an explicit limit so both paths page identically — V2.2 and
	// V2.3 schemas have different defaults (100 vs 50). The narrow types
	// in AutumnInt.events.list don't expose `limit`, so we cast through
	// `unknown` and rely on the underlying POST body accepting it.
	const PARITY_LIMIT = 500;
	const [v22Res, v23Res] = await Promise.all([
		autumnV22.events.list({
			customer_id: customerId,
			limit: PARITY_LIMIT,
		} as unknown as { customer_id: string }) as Promise<ApiEventsListResponse>,
		autumnV23.events.list({
			customer_id: customerId,
			limit: PARITY_LIMIT,
		} as unknown as { customer_id: string }) as Promise<
			CursorPaginatedResponse<ApiEventsListItem>
		>,
	]);

	// Sanity: both branches surfaced the same number of events for this
	// customer. If this fails, the most likely cause is one path hitting a
	// different Tinybird pipe or filtering inconsistently.
	expect(v22Res.list.length).toBe(v23Res.list.length);
	expect(v22Res.list.length).toBeGreaterThanOrEqual(SEED_EVENT_COUNT);

	// Both pipes sort `timestamp DESC, id DESC`, so the rows should appear
	// in the same order. Deep-equal the entire list[] to catch any
	// per-field divergence (e.g. timestamp coercion, deductions parsing,
	// properties shape).
	const diff = findDiff(v22Res.list, v23Res.list);
	if (diff) {
		console.log(chalk.red(`[events parity] divergence at ${diff}`));
	}
	expect(diff).toBeNull();

	// Envelope shape — V2.2 keeps the offset envelope, V2.3 swaps to
	// `next_cursor`. We assert structurally rather than depending on
	// SDK return-type generics.
	expect(typeof v22Res.has_more).toBe("boolean");
	expect(typeof v22Res.total).toBe("number");
	expect(typeof v22Res.offset).toBe("number");
	expect(typeof v22Res.limit).toBe("number");
	// V2.2 must NOT carry `next_cursor`.
	expect("next_cursor" in v22Res).toBe(false);

	// V2.3 must carry `next_cursor` (string | null) and must NOT carry
	// `has_more` / `total` / `offset`.
	expect(
		v23Res.next_cursor === null || typeof v23Res.next_cursor === "string",
	).toBe(true);
	expect("has_more" in v23Res).toBe(false);
	expect("total" in v23Res).toBe(false);
	expect("offset" in v23Res).toBe(false);
});

test.concurrent(`${chalk.yellowBright("events-list-v22-vs-v23-parity: V2.3 cursor round-trip returns disjoint pages")}`, async () => {
	const messagesItem = items.free({
		featureId: TestFeature.Messages,
		includedUsage: 1000,
	});
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	// Static prefix + per-run timestamp to keep this test independent from
	// state accumulated by prior runs (Tinybird is append-only here).
	const { customerId, autumnV2_2 } = await initScenario({
		customerId: `events-list-v23-cursor-roundtrip-${Date.now()}`,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Seed enough events to exercise pagination at limit=2 with at least
	// two non-empty pages.
	for (let i = 0; i < SEED_EVENT_COUNT; i++) {
		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: i + 1,
		});
	}

	await timeout(TINYBIRD_INGEST_WAIT_MS);

	const autumnV23 = new AutumnInt({ version: ApiVersion.V2_3 });

	const page1 = (await autumnV23.events.list({
		customer_id: customerId,
		// AutumnInt.events.list types are narrow, but the underlying POST
		// body accepts arbitrary params. We pass cursor + limit ad-hoc.
		cursor: "",
		limit: 2,
	} as unknown as {
		customer_id: string;
	})) as CursorPaginatedResponse<ApiEventsListItem>;

	expect(page1.list.length).toBe(2);
	expect(page1.next_cursor).not.toBeNull();
	expect(typeof page1.next_cursor).toBe("string");

	const page2 = (await autumnV23.events.list({
		customer_id: customerId,
		cursor: page1.next_cursor as string,
		limit: 2,
	} as unknown as {
		customer_id: string;
	})) as CursorPaginatedResponse<ApiEventsListItem>;

	expect(page2.list.length).toBeGreaterThan(0);

	// No event id should appear on both pages.
	const page1Ids = new Set(page1.list.map((e) => e.id));
	const page2Ids = new Set(page2.list.map((e) => e.id));
	const overlap = [...page1Ids].filter((id) => page2Ids.has(id));
	expect(overlap).toEqual([]);

	// Cursor sort is `timestamp DESC, id DESC` — every event on page 2
	// must be strictly earlier (or equal-timestamp with smaller id) than
	// every event on page 1.
	const minPage1Timestamp = Math.min(...page1.list.map((e) => e.timestamp));
	const maxPage2Timestamp = Math.max(...page2.list.map((e) => e.timestamp));
	expect(maxPage2Timestamp).toBeLessThanOrEqual(minPage1Timestamp);
});
