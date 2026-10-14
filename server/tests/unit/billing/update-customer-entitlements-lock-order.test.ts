import { expect, mock, test } from "bun:test";
import type { AutumnBillingPlan } from "@autumn/shared";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCustomerEntitlements } from "@/internal/billing/v2/execute/executeAutumnActions/updateCustomerEntitlements.js";

type PlanUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerEntitlements"]
>[number];

const planUpdate = ({ id }: { id: string }) =>
	({
		customerEntitlement: { id, entitlement: { feature: { id: "messages" } } },
		entityBalanceChanges: { entity_1: -1 },
	}) as unknown as PlanUpdate;

test("a plan locks every customer entitlement it updates in id order before writing any", async () => {
	const queries: { sql: string; params: unknown[] }[] = [];
	const db = drizzle(async (sql, params) => {
		queries.push({ sql, params });
		return { rows: [] };
	}) as unknown as DrizzleCli;
	const logger = { debug: mock(), info: mock(), warn: mock(), error: mock() };
	const ctx = { db, logger } as unknown as AutumnContext;

	await updateCustomerEntitlements({
		ctx,
		customerId: "customer_123",
		updates: [planUpdate({ id: "cus_ent_b" }), planUpdate({ id: "cus_ent_a" })],
	});

	expect(queries).toHaveLength(3);
	expect(queries[0].sql).toMatch(
		/from "customer_entitlements".*order by "customer_entitlements"\."id".*for update/i,
	);
	expect(queries[0].params).toEqual(["cus_ent_b", "cus_ent_a"]);
	expect(queries[1].sql).toMatch(/^update "customer_entitlements"/i);
	expect(queries[2].sql).toMatch(/^update "customer_entitlements"/i);
});
