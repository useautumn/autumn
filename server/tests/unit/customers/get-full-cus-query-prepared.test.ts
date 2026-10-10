import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv, CusProductStatus, RELEVANT_STATUSES } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const preparedCalls: { db: DrizzleCli; query: SQL; label: string }[] = [];
const preparedRows = [{ id: "customer_123", customer_products: [] }];

await mockModuleWithRestore("@/db/executePrepared.js", () => ({
	executePrepared: async (args: {
		db: DrizzleCli;
		query: SQL;
		label: string;
	}) => {
		preparedCalls.push(args);
		return preparedRows;
	},
}));

const { executeWithHealthTracking } = await import("@/db/pgHealthMonitor.js");
const { getFullCusQuery } = await import(
	"@/internal/customers/getFullCusQuery.js"
);

const dialect = new PgDialect();

const compile = ({
	customerId,
	orgId,
	cusProductLimit,
}: {
	customerId: string;
	orgId: string;
	cusProductLimit: number;
}) =>
	dialect.sqlToQuery(
		getFullCusQuery({
			idOrInternalId: customerId,
			orgId,
			env: AppEnv.Live,
			inStatuses: RELEVANT_STATUSES,
			includeInvoices: true,
			withEntities: true,
			withTrialsUsed: false,
			withSubs: true,
			withEvents: false,
			cusProductLimit,
		}),
	);

afterEach(() => {
	preparedCalls.length = 0;
});

describe("getFullCusQuery as a prepared statement", () => {
	test("emits identical SQL text for different customers, orgs and limits", () => {
		const first = compile({
			customerId: "customer_123",
			orgId: "org_123",
			cusProductLimit: 15,
		});
		const second = compile({
			customerId: "customer_456",
			orgId: "org_456",
			cusProductLimit: 50,
		});

		expect(second.sql).toBe(first.sql);
		expect(second.params).not.toEqual(first.params);
	});

	test("executeWithHealthTracking runs a labelled query through executePrepared unchanged", async () => {
		const db = {
			execute: () => {
				throw new Error("labelled queries must not use db.execute");
			},
		} as unknown as DrizzleCli;
		const query = getFullCusQuery({
			idOrInternalId: "customer_123",
			orgId: "org_123",
			env: AppEnv.Live,
			inStatuses: [CusProductStatus.Active],
			includeInvoices: false,
			withEntities: false,
			withTrialsUsed: false,
			withSubs: false,
			withEvents: false,
			cusProductLimit: 15,
		});

		const { result, usedReplica } = await executeWithHealthTracking({
			db,
			query,
			preparedLabel: "getFullCusQuery",
		});

		expect(preparedCalls).toEqual([{ db, query, label: "getFullCusQuery" }]);
		expect(result).toBe(preparedRows);
		expect(usedReplica).toBe(false);
	});

	test("executeWithHealthTracking without a label keeps db.execute", async () => {
		const rows = [{ id: "customer_123" }];
		const db = { execute: async () => rows } as unknown as DrizzleCli;

		const { result } = await executeWithHealthTracking({
			db,
			query: sql`select 1`,
		});

		expect(result).toBe(rows);
		expect(preparedCalls).toHaveLength(0);
	});
});
