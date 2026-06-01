import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/**
 * Pins result-equivalence of the events_hourly_apikey_mv fast path: an
 * events.aggregate grouped by properties.apiKeyId must return the same per-key
 * totals the events_hourly_mv path produced. Guards the apiKeyId routing branch
 * in aggregate_groupable.pipe against silent divergence (GROUP BY, the != ''
 * filter, the ::String cast, or distinct-property-row collapse).
 *
 * Requires the apikey MV + materialization deployed to the test Tinybird
 * workspace (forward materialization covers freshly-tracked events, so no
 * backfill is needed for this test's own data).
 */

const TINYBIRD_INGEST_WAIT_MS = 4000;

/** Sum every numeric value tied to each target apiKeyId, robust to the
 *  version-transformed response shape: matches both {"<key>": n} (grouped_values)
 *  and [{group:"<key>", messages:n}] layouts. Keys are unique long strings, so
 *  collisions are not a concern. */
const sumByApiKey = (
	node: unknown,
	keys: string[],
	acc: Record<string, number>,
): void => {
	if (Array.isArray(node)) {
		for (const el of node) sumByApiKey(el, keys, acc);
		return;
	}
	if (!node || typeof node !== "object") return;
	const obj = node as Record<string, unknown>;
	const siblingKey = keys.find((k) => Object.values(obj).includes(k));
	for (const [k, v] of Object.entries(obj)) {
		if (keys.includes(k) && typeof v === "number") {
			acc[k] = (acc[k] ?? 0) + v;
		} else if (siblingKey && typeof v === "number") {
			acc[siblingKey] = (acc[siblingKey] ?? 0) + v;
		} else {
			sumByApiKey(v, keys, acc);
		}
	}
};

test.concurrent(
	`${chalk.yellowBright("events-aggregate-group-by-apiKeyId: per-key totals correct via events_hourly_apikey_mv")}`,
	async () => {
		const ts = Date.now();
		const customerId = `agg-apikey-${ts}`;
		const KEY_A = `tb-apikey-A-${ts}`;
		const KEY_B = `tb-apikey-B-${ts}`;
		const KEY_NUM = 900000 + (ts % 100000); // numeric apiKeyId → exercises ::String cast
		const KEY_NUM_STR = String(KEY_NUM);
		const NO_KEY_VALUE = 91737; // distinctive: must be absent (no-apiKeyId event excluded)

		const messagesItem = items.free({
			featureId: TestFeature.Messages,
			includedUsage: 1_000_000,
		});
		const freeProd = products.base({ id: "free", items: [messagesItem] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const track = (value: number, properties: Record<string, unknown>) =>
			autumnV2_2.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value,
				properties,
			} as unknown as { customer_id: string });

		// KEY_A: 3×10, plus one event with an extra distinct property — the apikey MV
		// must collapse distinct other-property rows under one apiKeyId → 30 + 7 = 37.
		await track(10, { apiKeyId: KEY_A });
		await track(10, { apiKeyId: KEY_A });
		await track(10, { apiKeyId: KEY_A });
		await track(7, { apiKeyId: KEY_A, model: "gpt-4o" });
		// KEY_B: 2×5 = 10
		await track(5, { apiKeyId: KEY_B });
		await track(5, { apiKeyId: KEY_B });
		// numeric apiKeyId: 1×4 = 4
		await track(4, { apiKeyId: KEY_NUM });
		// no apiKeyId: must be excluded from grouped results (both paths filter != '')
		await track(NO_KEY_VALUE, { somethingElse: "x" });

		await timeout(TINYBIRD_INGEST_WAIT_MS);

		const autumn = new AutumnInt({ version: ApiVersion.V2_3 });
		const response = (await autumn.events.aggregate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			group_by: "properties.apiKeyId",
			range: "24h",
		} as unknown as { customer_id: string })) as unknown;

		const keys = [KEY_A, KEY_B, KEY_NUM_STR];
		const sums: Record<string, number> = {};
		sumByApiKey(response, keys, sums);

		if (sums[KEY_A] !== 37 || sums[KEY_B] !== 10 || sums[KEY_NUM_STR] !== 4) {
			console.log(
				chalk.red(
					`[apikey-agg] unexpected sums ${JSON.stringify(sums)} from ${JSON.stringify(response)}`,
				),
			);
		}

		expect(sums[KEY_A]).toBe(37);
		expect(sums[KEY_B]).toBe(10);
		expect(sums[KEY_NUM_STR]).toBe(4);

		// The no-apiKeyId event must not surface as a group.
		expect(JSON.stringify(response).includes(String(NO_KEY_VALUE))).toBe(false);
	},
);
