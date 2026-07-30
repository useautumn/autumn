/**
 * TDD test for events.aggregate silently returning PARTIAL data when a grouped
 * property has a MIX of gate-surviving and gate-dropped values (StackOne:
 * group_by "properties.projectId", short slugs alongside 32-char opaque ids).
 *
 * Distinct from uuid-group-by-fallback.test.ts, where EVERY value is dropped and
 * the rollup comes back empty. Here the short value materializes, so the result
 * is non-empty and any emptiness-based fallback never fires.
 *
 * Red-failure mode (pre-fix):
 *  - grouped_values contains only the short project id; the 32-char one is
 *    absent and the grouped sums fall short of total.sum, with no error.
 *
 * Green-success criteria:
 *  - The grouped sums reconcile against the ungated totals, so the server
 *    detects the shortfall and retries with skip_property_rollup=1 against
 *    events_hourly_mv, recovering both project ids.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// Survives the value-shape gate: short and not opaque-shaped.
const PROJECT_SHORT = "qa-71607";
// Dropped by the gate's `^[A-Za-z0-9_-]{32,}$` rule: exactly 32 alphanumerics.
const PROJECT_OPAQUE = "4uSlnf8w0kUb5WV6gEmBz07JVvgxfxTR";
const PROJECT_SHORT_VALUE = 7;
const PROJECT_OPAQUE_VALUE = 83;

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

const sumGroupValue = (
	response: AggregateResponse,
	featureId: string,
	groupValue: string,
): number =>
	response.list.reduce(
		(sum, row) => sum + (row.grouped_values?.[featureId]?.[groupValue] ?? 0),
		0,
	);

const sumAllGroupValues = (
	response: AggregateResponse,
	featureId: string,
): number =>
	response.list.reduce(
		(sum, row) =>
			sum +
			Object.values(row.grouped_values?.[featureId] ?? {}).reduce(
				(rowSum, value) => rowSum + value,
				0,
			),
		0,
	);

test.concurrent(
	`${chalk.yellowBright("aggregate partial-gate-drop: a property mixing gate-dropped and surviving values returns every group")}`,
	async () => {
		// Unique per run: tracked events persist in Tinybird across runs, and the
		// project ids are fixed, so only the customer scope keeps runs isolated.
		const customerId = `aggregate-partial-gate-drop-${Date.now()}`;
		const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
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
			value: PROJECT_SHORT_VALUE,
			properties: { projectId: PROJECT_SHORT },
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: PROJECT_OPAQUE_VALUE,
			properties: { projectId: PROJECT_OPAQUE },
		});

		// Events reach Tinybird via async batching — poll on the ungated totals so
		// the assertions aren't a false red from ingest lag.
		const expectedTotal = PROJECT_SHORT_VALUE + PROJECT_OPAQUE_VALUE;
		const deadline = Date.now() + EVENT_INGEST_TIMEOUT_MS;
		let response: AggregateResponse;
		do {
			await timeout(POLL_INTERVAL_MS);
			response = (await autumnV2_2.events.aggregate({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				group_by: "properties.projectId",
				range: "7d",
			})) as AggregateResponse;
		} while (
			Date.now() < deadline &&
			response.total[TestFeature.Messages]?.sum !== expectedTotal
		);

		expect(response.total[TestFeature.Messages]?.sum).toBe(expectedTotal);

		// The gate-surviving value alone makes the result non-empty, which is what
		// hides the shortfall from an emptiness check.
		expect(sumGroupValue(response, TestFeature.Messages, PROJECT_SHORT)).toBe(
			PROJECT_SHORT_VALUE,
		);

		// The bug: this group is dropped at insert and never comes back.
		expect(sumGroupValue(response, TestFeature.Messages, PROJECT_OPAQUE)).toBe(
			PROJECT_OPAQUE_VALUE,
		);

		// The invariant that makes the shortfall detectable at all.
		expect(sumAllGroupValues(response, TestFeature.Messages)).toBe(
			expectedTotal,
		);
	},
);
