import { afterEach, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { accrueRunCost } from "./accrueRunCost.ts";

const ENV_KEYS = [
	"TW_MODAL_REGION",
	"TWD_MODAL_REGION_MULTIPLIER",
	"TWD_USD_PER_CORE_SECOND",
	"TWD_USD_PER_GIB_SECOND",
] as const;
const saved = Object.fromEntries(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);
afterEach(() => {
	for (const key of ENV_KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

const captureAccrual = async () => {
	const statements: SQL[] = [];
	const ctx = { db: { execute: async (query: SQL) => statements.push(query) } };
	await accrueRunCost({ ctx: ctx as never, runId: "run_1" });
	return new PgDialect().sqlToQuery(statements[0] as SQL);
};

test("accrual prices each sandbox from create to terminate (or now) at sandbox rates x region", async () => {
	for (const key of ENV_KEYS) delete process.env[key];
	const { sql, params } = await captureAccrual();
	expect(sql).toContain("coalesce(ended_at, now()) - started_at");
	expect(params).toEqual([0.00003942, 0.00000667, 1.75, "run_1", "run_1"]);
});

test("accrual uses the overridden region multiplier", async () => {
	process.env.TWD_MODAL_REGION_MULTIPLIER = "1";
	const { params } = await captureAccrual();
	expect(params[2]).toBe(1);
});
