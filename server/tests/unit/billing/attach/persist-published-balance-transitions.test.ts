import { expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { persistPublishedBalanceTransitions } from "@/internal/billing/v2/actions/attach/persistPublishedBalanceTransitions.js";

test("persists a published balance only while Postgres still has the attach draft", async () => {
	let compiledQuery: ReturnType<PgDialect["sqlToQuery"]> | undefined;
	const ctx = {
		db: {
			execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
				compiledQuery = new PgDialect().sqlToQuery(query);
				return [{ id: "entitlement_b" }];
			},
		},
	} as unknown as AutumnContext;

	await persistPublishedBalanceTransitions({
		ctx,
		balanceTransitions: [
			{
				customerEntitlementId: "entitlement_b",
				expected: {
					balance: 195,
					adjustment: 0,
					additionalBalance: 0,
					cacheVersion: 0,
					nextResetAt: null,
				},
				published: {
					balance: 190,
					adjustment: 0,
					additionalBalance: 0,
					cacheVersion: 0,
					nextResetAt: null,
				},
			},
		],
	});

	expect(compiledQuery).toBeDefined();
	expect(compiledQuery?.sql).toContain("jsonb_to_recordset");
	expect(compiledQuery?.sql).toContain(
		"customer_entitlement.balance = transition.expected_balance",
	);
	expect(compiledQuery?.sql).toContain(
		"COALESCE(customer_entitlement.cache_version, 0) = transition.expected_cache_version",
	);
	expect(JSON.stringify(compiledQuery?.params)).toContain("entitlement_b");
	expect(JSON.stringify(compiledQuery?.params)).toContain("190");
});
