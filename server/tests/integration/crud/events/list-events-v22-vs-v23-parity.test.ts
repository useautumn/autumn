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

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: `events-list-v22-v23-parity-${Date.now()}`,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	for (let i = 0; i < SEED_EVENT_COUNT; i++) {
		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: i + 1,
		});
	}

	await timeout(TINYBIRD_INGEST_WAIT_MS);

	const autumnV22 = new AutumnInt({ version: ApiVersion.V2_2 });
	const autumnV23 = new AutumnInt({ version: ApiVersion.V2_3 });

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

	expect(v22Res.list.length).toBe(v23Res.list.length);
	expect(v22Res.list.length).toBeGreaterThanOrEqual(SEED_EVENT_COUNT);

	const diff = findDiff(v22Res.list, v23Res.list);
	if (diff) {
		console.log(chalk.red(`[events parity] divergence at ${diff}`));
	}
	expect(diff).toBeNull();

	expect(typeof v22Res.has_more).toBe("boolean");
	expect(typeof v22Res.total).toBe("number");
	expect(typeof v22Res.offset).toBe("number");
	expect(typeof v22Res.limit).toBe("number");
	expect("next_cursor" in v22Res).toBe(false);

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

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: `events-list-v23-cursor-roundtrip-${Date.now()}`,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

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

	const page1Ids = new Set(page1.list.map((e) => e.id));
	const page2Ids = new Set(page2.list.map((e) => e.id));
	const overlap = [...page1Ids].filter((id) => page2Ids.has(id));
	expect(overlap).toEqual([]);

	const minPage1Timestamp = Math.min(...page1.list.map((e) => e.timestamp));
	const maxPage2Timestamp = Math.max(...page2.list.map((e) => e.timestamp));
	expect(maxPage2Timestamp).toBeLessThanOrEqual(minPage1Timestamp);
});
