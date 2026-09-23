/**
 * Drives the real `aggregate()` with mocked Tinybird pipes to pin the
 * completeness routing for customer/entity-scoped property groups.
 *
 * Red-failure mode (pre-fix):
 *  - A scoped group-by never calls the coverage pipe; it reconciles against
 *    `getCountAndSum` (every event in scope), so one event without the property
 *    reads as gate loss and the query reruns ungated over raw events.
 *
 * Green-success criteria:
 *  - The coverage pipe is called with the same customer/entity scope as the
 *    grouped read, `getCountAndSum` is never consulted, and a grouped count that
 *    matches coverage produces no ungated retry.
 *  - Nested keys still reconcile against all-event totals, because the coverage
 *    rollups only index top-level keys.
 */
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const tinybirdModulePath = "@/external/tinybird/initTinybird";
const countAndSumModulePath = "@/internal/analytics/actions/getCountAndSum";

const realTinybird = { ...(await import(tinybirdModulePath)) };
const realCountAndSum = { ...(await import(countAndSumModulePath)) };

type Call = { name: string; params: Record<string, unknown> };
const calls: Call[] = [];

const groupedRows = [
	{
		period: "2026-08-25 00:00:00",
		event_name: "scrape",
		group_value: "68694",
		total_value: 99,
		event_count: 99,
	},
];

let coverageRows: Array<{ event_name: string; event_count: number }> = [];
let countAndSumTotals: Record<string, { count: number; sum: number }> = {};

mock.module(tinybirdModulePath, () => ({
	...realTinybird,
	getTinybirdPipes: () => ({
		aggregateGroupable: async (params: Record<string, unknown>) => {
			calls.push({ name: "aggregateGroupable", params });
			return { data: groupedRows };
		},
		propertyRollupCoverage: async (params: Record<string, unknown>) => {
			calls.push({ name: "propertyRollupCoverage", params });
			return { data: coverageRows };
		},
	}),
}));
mock.module(countAndSumModulePath, () => ({
	getCountAndSum: async (params: Record<string, unknown>) => {
		calls.push({ name: "getCountAndSum", params });
		return countAndSumTotals;
	},
}));

const { aggregate } = await import("@/internal/analytics/actions/aggregate");

afterAll(() => {
	mock.module(tinybirdModulePath, () => realTinybird);
	mock.module(countAndSumModulePath, () => realCountAndSum);
});

beforeEach(() => {
	calls.length = 0;
	coverageRows = [];
	countAndSumTotals = {};
});

const ctx = {
	org: { id: "org_scoped" },
	env: "live",
	logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
} as unknown as AutumnContext;

const scopedParams = ({ groupBy }: { groupBy: string }) => ({
	event_names: ["scrape"],
	customer_id: "cus_team",
	entity_id: "ent_workspace",
	custom_range: {
		start: Date.UTC(2026, 5, 24),
		end: Date.UTC(2026, 8, 22),
	},
	bin_size: "day" as const,
	group_by: groupBy,
});

const callsNamed = (name: string) => calls.filter((call) => call.name === name);

test(`${chalk.yellowBright(
	"aggregate scoped coverage: a customer/entity group-by reconciles against coverage in the same scope",
)}`, async () => {
	// 100 events carry apiKeyId, 1 does not; the grouped rollup reports 99 because
	// one value was gate-dropped. Coverage in scope says 100, so this is real loss.
	coverageRows = [{ event_name: "scrape", event_count: 100 }];

	await aggregate({
		ctx,
		params: scopedParams({ groupBy: "properties.apiKeyId" }),
	});

	const [coverageCall] = callsNamed("propertyRollupCoverage");
	expect(coverageCall).toBeDefined();
	expect(coverageCall.params.customer_id).toBe("cus_team");
	expect(coverageCall.params.entity_id).toBe("ent_workspace");
	expect(coverageCall.params.property_key).toBe("apiKeyId");
	expect(callsNamed("getCountAndSum")).toHaveLength(0);

	// Real gate loss still retries ungated.
	const grouped = callsNamed("aggregateGroupable");
	expect(grouped).toHaveLength(2);
	expect(grouped[1].params.skip_property_rollup).toBe("1");
});

test(`${chalk.yellowBright(
	"aggregate scoped coverage: events without the property never trigger the ungated retry",
)}`, async () => {
	// The reported shape: the grouped count equals the number of events that carry
	// apiKeyId. The extra event without it is invisible to coverage, so no retry.
	coverageRows = [{ event_name: "scrape", event_count: 99 }];

	await aggregate({
		ctx,
		params: scopedParams({ groupBy: "properties.apiKeyId" }),
	});

	expect(callsNamed("propertyRollupCoverage")).toHaveLength(1);
	expect(callsNamed("getCountAndSum")).toHaveLength(0);
	expect(callsNamed("aggregateGroupable")).toHaveLength(1);
});

test(`${chalk.yellowBright(
	"aggregate scoped coverage: nested keys keep the all-event totals check",
)}`, async () => {
	countAndSumTotals = { scrape: { count: 100, sum: 100 } };

	await aggregate({
		ctx,
		params: scopedParams({ groupBy: "properties.metadata.region" }),
	});

	expect(callsNamed("propertyRollupCoverage")).toHaveLength(0);
	expect(callsNamed("getCountAndSum")).toHaveLength(1);
	// The rollup can't serve a nested key, so the shortfall forces the retry that
	// actually answers the query.
	expect(callsNamed("aggregateGroupable")).toHaveLength(2);
});

test(`${chalk.yellowBright(
	"aggregate scoped coverage: coverage below the grouped count means an unpopulated rollup, so fall back to all-event totals",
)}`, async () => {
	// Every grouped event carries the key, so a populated coverage rollup can never
	// report fewer than the grouped count. Seeing that means the coverage MV is
	// empty or mid-backfill, and trusting it would hide real gate loss.
	coverageRows = [{ event_name: "scrape", event_count: 40 }];
	countAndSumTotals = { scrape: { count: 120, sum: 120 } };

	await aggregate({
		ctx,
		params: scopedParams({ groupBy: "properties.apiKeyId" }),
	});

	expect(callsNamed("propertyRollupCoverage")).toHaveLength(1);
	expect(callsNamed("getCountAndSum")).toHaveLength(1);
	expect(callsNamed("aggregateGroupable")).toHaveLength(2);
});
