import { afterAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { isCustomerRecentlyUpdated } from "@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js";
import { markCustomerUpdatedAt } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";

// Real-DB coverage: upsert idempotency + freshness boundary use the DB clock,
// so they cannot be faked meaningfully with an injected stub.
const { db, client } = initDrizzle();

const orgId = `lsn_test_org_${Date.now()}`;
const env = "sandbox";

type LedgerRow = {
	customer_id: string;
	internal_customer_id: string | null;
	updated_at: string;
};

const fetchRows = async (customerId: string): Promise<LedgerRow[]> =>
	await db.execute<LedgerRow>(sql`
		SELECT customer_id, internal_customer_id, updated_at::text
		FROM customer_lsns
		WHERE org_id = ${orgId} AND env = ${env} AND customer_id = ${customerId}
	`);

const backdateRow = async ({
	customerId,
	seconds,
}: {
	customerId: string;
	seconds: number;
}) => {
	await db.execute(sql`
		UPDATE customer_lsns
		SET updated_at = now() - make_interval(secs => ${seconds})
		WHERE org_id = ${orgId} AND env = ${env} AND customer_id = ${customerId}
	`);
};

afterAll(async () => {
	if (!process.env.DATABASE_URL) return;
	await db.execute(sql`DELETE FROM customer_lsns WHERE org_id = ${orgId}`);
	await client.end();
});

describe.skipIf(!process.env.DATABASE_URL)(
	"customer_lsns ledger (real DB)",
	() => {
		it("upsert is idempotent on the PK and moves updated_at forward", async () => {
			const customerId = "cus_idem";

			await markCustomerUpdatedAt({ db, orgId, env, customerId });
			const [first] = await fetchRows(customerId);
			expect(first).toBeDefined();
			expect(first.internal_customer_id).toBeNull();

			await new Promise((resolve) => setTimeout(resolve, 30));
			await markCustomerUpdatedAt({
				db,
				orgId,
				env,
				customerId,
				internalCustomerId: "internal_abc",
			});

			const rows = await fetchRows(customerId);
			expect(rows.length).toBe(1);
			expect(rows[0].internal_customer_id).toBe("internal_abc");
			expect(new Date(rows[0].updated_at).getTime()).toBeGreaterThan(
				new Date(first.updated_at).getTime(),
			);
		});

		it("COALESCE keeps a known internal_customer_id when a later mark omits it", async () => {
			const customerId = "cus_coalesce";

			await markCustomerUpdatedAt({
				db,
				orgId,
				env,
				customerId,
				internalCustomerId: "internal_keep",
			});
			await markCustomerUpdatedAt({ db, orgId, env, customerId });

			const rows = await fetchRows(customerId);
			expect(rows[0].internal_customer_id).toBe("internal_keep");
		});

		it("freshness window boundary: fresh inside 60s, stale outside", async () => {
			const customerId = "cus_window";
			await markCustomerUpdatedAt({ db, orgId, env, customerId });

			expect(
				await isCustomerRecentlyUpdated({ db, orgId, env, customerId }),
			).toBe(true);

			await backdateRow({ customerId, seconds: 59 });
			expect(
				await isCustomerRecentlyUpdated({ db, orgId, env, customerId }),
			).toBe(true);

			await backdateRow({ customerId, seconds: 61 });
			expect(
				await isCustomerRecentlyUpdated({ db, orgId, env, customerId }),
			).toBe(false);
		});

		it("unknown customer is not recently updated", async () => {
			expect(
				await isCustomerRecentlyUpdated({
					db,
					orgId,
					env,
					customerId: "cus_never_written",
				}),
			).toBe(false);
		});
	},
);
