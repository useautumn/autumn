import { afterAll, describe, expect, it } from "bun:test";
import type { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { batchInvalidateCachedFullSubjects } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
import { markCustomersUpdatedAt } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";

// Real-DB coverage: the invalidation chokepoints must stamp the freshness
// ledger even when no Redis client is reachable — marks are pure DB writes.
const { db, client } = initDrizzle();

const orgId = `lsn_inv_org_${Date.now()}`;
const env = "sandbox";

type LedgerRow = { customer_id: string; updated_at: string };

const fetchRows = async (): Promise<LedgerRow[]> =>
	await db.execute<LedgerRow>(sql`
		SELECT customer_id, updated_at::text
		FROM customer_lsns
		WHERE org_id = ${orgId} AND env = ${env}
		ORDER BY customer_id
	`);

afterAll(async () => {
	await db.execute(sql`DELETE FROM customer_lsns WHERE org_id = ${orgId}`);
	await client.end();
});

describe("invalidation chokepoint freshness marks (real DB)", () => {
	it("bulk mark dedupes duplicate triples instead of erroring", async () => {
		// Duplicate conflict targets in one multi-row upsert are a Postgres
		// error ("cannot affect row a second time") — dedupe must prevent it.
		await markCustomersUpdatedAt({
			db,
			customers: [
				{ orgId, env, customerId: "cus_dup" },
				{ orgId, env, customerId: "cus_dup" },
				{ orgId, env, customerId: "cus_other" },
			],
		});

		const rows = await fetchRows();
		expect(rows.map((row) => row.customer_id)).toEqual([
			"cus_dup",
			"cus_other",
		]);
	});

	it("bulk mark moves updated_at forward on re-mark", async () => {
		const [before] = await fetchRows();

		await new Promise((resolve) => setTimeout(resolve, 30));
		await markCustomersUpdatedAt({
			db,
			customers: [{ orgId, env, customerId: "cus_dup" }],
		});

		const [after] = await fetchRows();
		expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
			new Date(before.updated_at).getTime(),
		);
	});

	it("bulk mark skips blank customer ids", async () => {
		await markCustomersUpdatedAt({
			db,
			customers: [{ orgId, env, customerId: "" }],
		});

		const rows = await fetchRows();
		expect(rows.some((row) => row.customer_id === "")).toBe(false);
	});

	it("batchInvalidateCachedFullSubjects marks every customer even with zero redis targets", async () => {
		// getRedisTargetsForCustomer returning [] models "no reachable Redis":
		// the cache side is a no-op but the ledger stamp must still land.
		const customers = [
			{ orgId, env: env as AppEnv, customerId: "cus_batch_a" },
			{ orgId, env: env as AppEnv, customerId: "cus_batch_b" },
		];

		await batchInvalidateCachedFullSubjects({
			customers,
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [],
		});

		const rows = await fetchRows();
		const ids = rows.map((row) => row.customer_id);
		expect(ids).toContain("cus_batch_a");
		expect(ids).toContain("cus_batch_b");
	});
});
