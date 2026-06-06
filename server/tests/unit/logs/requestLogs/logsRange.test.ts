import { describe, expect, test } from "bun:test";
import {
	getQueryLogsRangePolicy,
	resolveLogsRange,
} from "@/internal/logs/handlers/logsRequestUtils.js";
import { parseRestrictedApl } from "@/internal/logs/parser/restrictedApl.js";

const queryStages = [
	"where",
	"summarize",
	"project",
	"orderBy",
	"limit",
] as const;
const now = new Date("2026-06-06T12:00:00.000Z");

const parseQuery = (query: string) =>
	parseRestrictedApl({
		query,
		allowedStages: [...queryStages],
	});

describe("request-log ranges", () => {
	test("defaults customer-filtered aggregate queries to 30 days", () => {
		const policy = getQueryLogsRangePolicy(
			parseQuery("where customer_id == 'cus_1' | summarize requests = count()"),
		);

		expect(resolveLogsRange({ now, ...policy })).toEqual({
			startDate: "2026-05-07T12:00:00.000Z",
			endDate: "2026-06-06T12:00:00.000Z",
		});
	});

	test("defaults org-scoped aggregate queries to 15 days", () => {
		const policy = getQueryLogsRangePolicy(
			parseQuery("where status_code >= 400 | summarize requests = count()"),
		);

		expect(resolveLogsRange({ now, ...policy })).toEqual({
			startDate: "2026-05-22T12:00:00.000Z",
			endDate: "2026-06-06T12:00:00.000Z",
		});
	});

	test("does not treat customer grouping as a customer-scoped filter", () => {
		const policy = getQueryLogsRangePolicy(
			parseQuery("summarize requests = count() by customer_id"),
		);

		expect(resolveLogsRange({ now, ...policy }).startDate).toBe(
			"2026-05-22T12:00:00.000Z",
		);
	});

	test("rejects org-scoped aggregate ranges over 15 days", () => {
		const policy = getQueryLogsRangePolicy(
			parseQuery("summarize requests = count() by request_path"),
		);

		expect(() =>
			resolveLogsRange({
				startDate: "2026-05-21T12:00:00.000Z",
				endDate: now.toISOString(),
				...policy,
			}),
		).toThrow("Log range cannot exceed 15 days");
	});

	test("allows customer-filtered aggregate ranges up to 30 days", () => {
		const policy = getQueryLogsRangePolicy(
			parseQuery(
				"where context.customer_id == 'cus_1' | summarize requests = count()",
			),
		);

		expect(
			resolveLogsRange({
				startDate: "2026-05-07T12:00:00.000Z",
				endDate: now.toISOString(),
				...policy,
			}),
		).toEqual({
			startDate: "2026-05-07T12:00:00.000Z",
			endDate: "2026-06-06T12:00:00.000Z",
		});
	});
});
