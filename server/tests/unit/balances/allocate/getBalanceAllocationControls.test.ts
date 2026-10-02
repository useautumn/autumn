import { expect, test } from "bun:test";
import { AppEnv, EntInterval, ResetInterval } from "@autumn/shared";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBalanceAllocationControls } from "@/internal/balances/allocate/getBalanceAllocationControls.js";

test("allocation responses preserve stored shares on retained soft-deleted entities", async () => {
	let selection: { sql: string; params: unknown[] } | undefined;
	const ctx = {
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		db: {
			select: () => ({
				from: () => ({
					where: async (query: SQL) => {
						selection = new PgDialect().sqlToQuery(query);
						return [{ id: "entity_123", internalId: "ent_123", deleted: true }];
					},
				}),
			}),
		},
	} as unknown as AutumnContext;
	const controls = await getBalanceAllocationControls({
		ctx,
		internalCustomerId: "cus_123",
		allocations: {
			fea_123: {
				feature_id: "credits",
				interval: EntInterval.Month,
				amounts: { ent_123: 40 },
				scale: 0.5,
				scale_cycle_end: 1000,
				parent_customer_entitlement_id: "cus_ent_123",
			},
		},
	});
	expect(controls).toEqual([
		{
			feature_id: "credits",
			interval: ResetInterval.Month,
			allocations: [{ entity_id: "entity_123", amount: 40 }],
		},
	]);
	expect(selection?.sql).not.toContain('"deleted"');
	expect(selection?.params).toEqual([
		"org_123",
		AppEnv.Sandbox,
		"cus_123",
		"ent_123",
	]);
});

test("empty allocations render without an entity lookup", async () => {
	expect(
		await getBalanceAllocationControls({
			ctx: {} as AutumnContext,
			internalCustomerId: "cus_123",
			allocations: {},
		}),
	).toEqual([]);
});
