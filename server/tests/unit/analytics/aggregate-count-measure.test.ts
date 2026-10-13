/**
 * Drives the real `aggregate()` with mocked Tinybird pipes to pin the "count" measure.
 *
 * Green-success criteria:
 *  - measure "count" fills each bin from the pipe's event_count, ungrouped and grouped
 *    (including the AUTUMN_RESERVED bucket); the default measure keeps total_value.
 *  - Count queries rank top groups by event count in both the ranking pipe and the
 *    grouped series pipe; sum queries send no rank_by, so their SQL is unchanged.
 *  - A pipe row without event_count fails a count query rather than reporting zeros.
 */
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { EventsAggregateParamsSchema } from "@autumn/shared";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const tinybirdModulePath = "@/external/tinybird/initTinybird";
const realTinybird = { ...(await import(tinybirdModulePath)) };

type Call = { name: string; params: Record<string, unknown> };
const calls: Call[] = [];

const PERIOD = "2026-08-25 00:00:00";
let simpleRows: Record<string, unknown>[] = [];
let groupedRows: Record<string, unknown>[] = [];

mock.module(tinybirdModulePath, () => ({
	...realTinybird,
	getTinybirdPipes: () => ({
		aggregateSimple: async (params: Record<string, unknown>) => {
			calls.push({ name: "aggregateSimple", params });
			return { data: simpleRows };
		},
		aggregateGroupable: async (params: Record<string, unknown>) => {
			calls.push({ name: "aggregateGroupable", params });
			return { data: groupedRows };
		},
		aggregateGroupableTopGroups: async (params: Record<string, unknown>) => {
			calls.push({ name: "aggregateGroupableTopGroups", params });
			return { data: [{ event_name: "messages", group_value: "cus_a" }] };
		},
	}),
}));

const { aggregate } = await import("@/internal/analytics/actions/aggregate");

afterAll(() => {
	mock.module(tinybirdModulePath, () => realTinybird);
});

beforeEach(() => {
	calls.length = 0;
	simpleRows = [
		{
			period: PERIOD,
			event_name: "messages",
			total_value: 42.5,
			event_count: 3,
		},
	];
	groupedRows = [
		{
			period: PERIOD,
			event_name: "messages",
			group_value: "cus_a",
			total_value: 40,
			event_count: 2,
			_truncated: false,
		},
		{
			period: PERIOD,
			event_name: "messages",
			group_value: "AUTUMN_RESERVED",
			total_value: 2.5,
			event_count: 7,
			_truncated: true,
		},
	];
});

const ctx = {
	org: { id: "org_count" },
	env: "live",
	logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
} as unknown as AutumnContext;

const params = ({
	measure,
	groupBy,
}: {
	measure?: "sum" | "count";
	groupBy?: string;
}) => ({
	event_names: ["messages"],
	aggregateAll: true,
	custom_range: {
		start: Date.UTC(2026, 7, 25),
		end: Date.UTC(2026, 7, 25, 23),
	},
	bin_size: "day" as const,
	no_count: true,
	group_by: groupBy,
	group_ranking: groupBy ? ("window" as const) : undefined,
	measure,
});

const valuesAt = ({
	data,
	groupValue,
}: {
	data: Record<string, unknown>[];
	groupValue?: string;
}) =>
	data.find(
		(row) =>
			row.period === PERIOD &&
			(groupValue === undefined || row.customer_id === groupValue),
	)?.messages;

const callsNamed = (name: string) => calls.filter((call) => call.name === name);

test(`${chalk.yellowBright("aggregate count measure: ungrouped bins report event_count")}`, async () => {
	const count = await aggregate({ ctx, params: params({ measure: "count" }) });
	expect(valuesAt({ data: count.formatted.data })).toBe(3);

	const sum = await aggregate({ ctx, params: params({}) });
	expect(valuesAt({ data: sum.formatted.data })).toBe(42.5);
});

test(`${chalk.yellowBright("aggregate count measure: grouped bins and the Other bucket report event_count")}`, async () => {
	const { formatted } = await aggregate({
		ctx,
		params: params({ measure: "count", groupBy: "customer_id" }),
	});

	expect(valuesAt({ data: formatted.data, groupValue: "cus_a" })).toBe(2);
	expect(
		valuesAt({ data: formatted.data, groupValue: "AUTUMN_RESERVED" }),
	).toBe(7);
});

test(`${chalk.yellowBright("aggregate count measure: count ranks top groups by event count")}`, async () => {
	await aggregate({
		ctx,
		params: params({ measure: "count", groupBy: "customer_id" }),
	});

	expect(callsNamed("aggregateGroupableTopGroups")[0].params.rank_by).toBe(
		"count",
	);
	expect(callsNamed("aggregateGroupable")[0].params.rank_by).toBe("count");
});

test(`${chalk.yellowBright("aggregate count measure: sum queries send no rank_by")}`, async () => {
	await aggregate({ ctx, params: params({ groupBy: "customer_id" }) });

	expect(
		callsNamed("aggregateGroupableTopGroups")[0].params.rank_by,
	).toBeUndefined();
	expect(callsNamed("aggregateGroupable")[0].params.rank_by).toBeUndefined();
});

test(`${chalk.yellowBright("aggregate count measure: a pipe without event_count fails instead of reporting zeros")}`, async () => {
	simpleRows = [{ period: PERIOD, event_name: "messages", total_value: 42.5 }];

	await expect(
		aggregate({ ctx, params: params({ measure: "count" }) }),
	).rejects.toThrow("event_count");
	const sum = await aggregate({ ctx, params: params({}) });
	expect(valuesAt({ data: sum.formatted.data })).toBe(42.5);
});

test(`${chalk.yellowBright("events.aggregate params: measure accepts sum and count only")}`, () => {
	const base = { feature_id: "messages", range: "7d" };
	expect(
		EventsAggregateParamsSchema.parse({ ...base, measure: "count" }).measure,
	).toBe("count");
	expect(EventsAggregateParamsSchema.parse(base).measure).toBeUndefined();
	expect(
		EventsAggregateParamsSchema.safeParse({ ...base, measure: "avg" }).success,
	).toBe(false);
});
