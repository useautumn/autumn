import { expect, mock, test } from "bun:test";
import type { TotalEventsParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const state = {
	dailyMode: "no_rows" as
		| "error"
		| "missing_event"
		| "mixed_events"
		| "no_rows"
		| "partial_coverage"
		| "populated",
	queries: [] as string[],
};

const dailyRowsByMode = {
	missing_event: [
		{
			count: "12",
			daily_rollup_days: "2",
			event_name: "emails.sent",
			expected_daily_days: "2",
			sum: "12",
		},
	],
	mixed_events: [
		{
			count: "12",
			daily_rollup_days: "2",
			event_name: "emails.sent",
			expected_daily_days: "2",
			sum: "12",
		},
		{
			count: "2",
			daily_rollup_days: "0",
			event_name: "emails.delivered",
			expected_daily_days: "2",
			sum: "2",
		},
	],
	no_rows: [
		{
			count: "2",
			daily_rollup_days: "0",
			event_name: "emails.sent",
			expected_daily_days: "2",
			sum: "2",
		},
	],
	partial_coverage: [
		{
			count: "8",
			daily_rollup_days: "1",
			event_name: "emails.sent",
			expected_daily_days: "2",
			sum: "8",
		},
	],
	populated: [
		{
			count: "12",
			daily_rollup_days: "2",
			event_name: "emails.sent",
			expected_daily_days: "2",
			sum: "12",
		},
	],
};

mock.module("@/external/tinybird/initClickhouse.js", () => ({
	getClickhouseClient: () => ({
		query: async ({
			query,
			query_params: queryParams,
		}: {
			query: string;
			query_params?: { event_names?: string[] };
		}) => {
			state.queries.push(query);
			const isDailyQuery = query.includes("events_customer_daily_mv");
			if (isDailyQuery && state.dailyMode === "error") {
				throw new Error("daily datasource unavailable");
			}

			const data = isDailyQuery
				? dailyRowsByMode[state.dailyMode as keyof typeof dailyRowsByMode]
				: (queryParams?.event_names ?? []).map((eventName) => ({
						count: eventName === "emails.sent" ? "42" : "17",
						event_name: eventName,
						sum: eventName === "emails.sent" ? "42" : "17",
					}));

			return { json: async () => ({ data }) };
		},
	}),
}));

const { getCountAndSum } = await import(
	"@/internal/analytics/actions/getCountAndSum.js"
);

const runDailyTotalsQuery = async ({
	dailyMode,
	eventNames = ["emails.sent"],
}: {
	dailyMode: typeof state.dailyMode;
	eventNames?: string[];
}) => {
	state.dailyMode = dailyMode;
	state.queries = [];
	const warnings: Array<{ message: string; metadata?: unknown }> = [];
	const ctx = {
		env: "live",
		logger: {
			debug: () => undefined,
			warn: (message: string, metadata?: unknown) => {
				warnings.push({ message, metadata });
			},
		},
		org: { id: "org_test" },
	} as unknown as AutumnContext;
	const params = {
		bin_size: "day",
		customer_id: "customer_test",
		event_names: eventNames,
	} satisfies TotalEventsParams;

	const summary = await getCountAndSum({
		ctx,
		dateRange: {
			endDate: "2026-08-03T12:00:00",
			startDate: "2026-08-01T00:00:00",
		},
		params,
	});

	return { summary, warnings };
};

test("daily totals: retry hourly when the daily source contributes no full-day rows", async () => {
	const { summary, warnings } = await runDailyTotalsQuery({
		dailyMode: "no_rows",
	});

	expect(summary).toEqual({ "emails.sent": { count: 42, sum: 42 } });
	expect(state.queries).toHaveLength(2);
	expect(state.queries[0]).toContain("events_customer_daily_mv");
	expect(state.queries[1]).toContain("events_customer_hourly_mv");
	expect(state.queries[1]).not.toContain("events_customer_daily_mv");
	expect(warnings).toHaveLength(1);
});

test("daily totals: keep populated daily reads on the fast path", async () => {
	const { summary, warnings } = await runDailyTotalsQuery({
		dailyMode: "populated",
	});

	expect(summary).toEqual({ "emails.sent": { count: 12, sum: 12 } });
	expect(state.queries).toHaveLength(1);
	expect(state.queries[0]).toContain("events_customer_daily_mv");
	expect(warnings).toHaveLength(0);
});

test("daily totals: retry hourly when one event lacks daily coverage", async () => {
	const { summary } = await runDailyTotalsQuery({
		dailyMode: "mixed_events",
		eventNames: ["emails.sent", "emails.delivered"],
	});

	expect(summary).toEqual({
		"emails.delivered": { count: 17, sum: 17 },
		"emails.sent": { count: 42, sum: 42 },
	});
	expect(state.queries).toHaveLength(2);
});

test("daily totals: retry hourly when a requested event is absent", async () => {
	const { summary } = await runDailyTotalsQuery({
		dailyMode: "missing_event",
		eventNames: ["emails.sent", "emails.delivered"],
	});

	expect(summary).toEqual({
		"emails.delivered": { count: 17, sum: 17 },
		"emails.sent": { count: 42, sum: 42 },
	});
	expect(state.queries).toHaveLength(2);
});

test("daily totals: retry hourly when the requested day window is partial", async () => {
	const { summary } = await runDailyTotalsQuery({
		dailyMode: "partial_coverage",
	});

	expect(summary).toEqual({ "emails.sent": { count: 42, sum: 42 } });
	expect(state.queries).toHaveLength(2);
});

test("daily totals: do not amplify Tinybird errors with an hourly retry", async () => {
	await expect(runDailyTotalsQuery({ dailyMode: "error" })).rejects.toThrow(
		"daily datasource unavailable",
	);
	expect(state.queries).toHaveLength(1);
});
