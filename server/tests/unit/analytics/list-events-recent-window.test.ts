import { beforeEach, expect, test } from "bun:test";
import { RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

type PipeParams = Record<string, unknown>;
const calls: PipeParams[] = [];
let respond: (params: PipeParams) => Promise<{ data: unknown[] }>;

await mockModuleWithRestore("@/external/tinybird/initTinybird", () => ({
	getTinybirdPipes: () => ({
		listEventsCursor: async (params: PipeParams) => {
			calls.push(params);
			return respond(params);
		},
	}),
}));

const { listByCursor } = await import(
	"@/internal/analytics/actions/listByCursor"
);

const ctx = {
	org: { id: "org_list" },
	env: "live",
	logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
} as unknown as AutumnContext;

const END = Date.UTC(2026, 9, 15, 13, 35, 27);
const YEAR_AGO = Date.UTC(2025, 9, 15);

const rows = (count: number) =>
	Array.from({ length: count }, (_, i) => ({
		id: `evt_${i}`,
		org_id: "org_list",
		env: "live",
		customer_id: "cus_1",
		event_name: "credits",
		timestamp: "2026-10-15 13:35:00.000000",
		value: 1,
		properties: "{}",
		idempotency_key: null,
		entity_id: "",
		deductions: null,
	}));

const list = (customerId?: string) =>
	listByCursor({
		ctx,
		params: {
			customer_id: customerId,
			custom_range: { start: YEAR_AGO, end: END },
			start_cursor: "",
			limit: 10,
		},
	});

beforeEach(() => {
	calls.length = 0;
	respond = async () => ({ data: rows(11) });
});

test("customer list reads the last day first when it fills the page", async () => {
	const result = await list("cus_1");

	expect(calls.map((c) => c.start_date)).toEqual(["2026-10-14 13:35:27"]);
	expect(result.list).toHaveLength(10);
	expect(result.next_cursor).not.toBeNull();
});

test("customer list widens to the full range when recent windows are short", async () => {
	respond = async () => ({ data: rows(3) });

	const result = await list("cus_1");

	expect(calls.map((c) => c.start_date)).toEqual([
		"2026-10-14 13:35:27",
		"2026-10-08 13:35:27",
		"2026-09-15 13:35:27",
		"2025-10-15 00:00:00",
	]);
	expect(result.list).toHaveLength(3);
	expect(result.next_cursor).toBeNull();
});

test("org-wide list queries the requested range once", async () => {
	await list();

	expect(calls.map((c) => c.start_date)).toEqual(["2025-10-15 00:00:00"]);
});

test("a Tinybird timeout surfaces as a 504 asking to narrow the query", async () => {
	respond = async () => {
		throw new Error(
			"[Error] Timeout exceeded: elapsed 60029.8 ms, maximum: 60000 ms. Upgrade your plan for higher capacity, ensure your cluster isn't overloaded (dedicated infrastructure only), or optimize your query with filters. (query_id=q_1)",
		);
	};

	const error = await list().catch((e: unknown) => e);

	expect(error).toBeInstanceOf(RecaseError);
	expect((error as RecaseError).statusCode).toBe(504);
	expect((error as RecaseError).message).toContain("narrow");
});
