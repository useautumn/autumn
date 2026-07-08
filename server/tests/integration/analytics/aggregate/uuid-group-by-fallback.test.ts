/**
 * TDD test for events.aggregate returning an empty list when group_by targets a
 * property whose values are UUIDs (Mastra: group_by "properties.project_id").
 *
 * Root cause: aggregate_groupable routes unfiltered property group-bys to
 * events_property_mv, whose insert-time value-shape gate drops UUID/high-entropy
 * values — so the key has zero rows in the rollup and the query silently returns
 * nothing, while totals (served from an ungated pipe) look correct.
 *
 * Red-failure mode (current behavior):
 *  - list is [] even though the tracked events exist and totals report them.
 *
 * Green-success criteria (after fix — requires the property_key_exists probe pipe
 * and the skip_property_rollup param to be deployed to Tinybird):
 *  - The server probes events_property_mv for the key, finds it absent, and routes
 *    to the ungated events_hourly_mv — the list contains per-period grouped_values
 *    keyed by the UUID project ids with the tracked sums.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const PROJECT_A = "30e8f7ae-2415-4ca7-bcc7-9139ebcd99bc";
const PROJECT_B = "2a625fb0-f627-41a9-8c38-a0d7ea985d65";
const PROJECT_A_VALUE = 30;
const PROJECT_B_VALUE = 12;

const EVENT_INGEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 3_000;

type AggregateResponse = {
	list: {
		period: number;
		values: Record<string, number>;
		grouped_values?: Record<string, Record<string, number>>;
	}[];
	total: Record<string, { count: number; sum: number }>;
};

/** Sums a group's value across all periods in the response list */
const sumGroupValue = (
	response: AggregateResponse,
	featureId: string,
	groupValue: string,
): number =>
	response.list.reduce(
		(sum, row) => sum + (row.grouped_values?.[featureId]?.[groupValue] ?? 0),
		0,
	);

test.concurrent(
	`${chalk.yellowBright("aggregate uuid-group-by: group_by on a UUID-valued property returns grouped data")}`,
	async () => {
		// Unique per run: tracked events persist in Tinybird across runs (deleting
		// the customer doesn't purge them), so a reused id double-counts the sums.
		const customerId = `aggregate-uuid-group-by-${Date.now()}`;
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({ id: "free", items: [messagesItem] });

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd], prefix: customerId }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: PROJECT_A_VALUE,
			properties: { project_id: PROJECT_A },
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: PROJECT_B_VALUE,
			properties: { project_id: PROJECT_B },
		});

		// Events reach Tinybird via async batching — poll until the totals see them
		// so the final assertion isn't a false red from ingest lag.
		const deadline = Date.now() + EVENT_INGEST_TIMEOUT_MS;
		let response: AggregateResponse;
		do {
			await timeout(POLL_INTERVAL_MS);
			// autumnV2_2: the modern response shape ({values, grouped_values}) —
			// older api versions flatten rows to {period, [feature]: {group: value}}.
			response = (await autumnV2_2.events.aggregate({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				group_by: "properties.project_id",
				range: "7d",
			})) as AggregateResponse;
		} while (
			Date.now() < deadline &&
			sumGroupValue(response, TestFeature.Messages, PROJECT_A) !==
				PROJECT_A_VALUE
		);

		// Totals are served from an ungated pipe and were always correct — this
		// guards against a false red where ingest never happened at all.
		expect(response.total[TestFeature.Messages]?.sum).toBe(
			PROJECT_A_VALUE + PROJECT_B_VALUE,
		);

		// The bug: list comes back [] because the query hits events_property_mv,
		// which never materialized the UUID values.
		expect(response.list.length).toBeGreaterThan(0);
		expect(sumGroupValue(response, TestFeature.Messages, PROJECT_A)).toBe(
			PROJECT_A_VALUE,
		);
		expect(sumGroupValue(response, TestFeature.Messages, PROJECT_B)).toBe(
			PROJECT_B_VALUE,
		);
	},
);
