import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { withAutocommitDb } from "@/db/autocommit/withAutocommitDb.js";
import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withPlanTransaction } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/writePlanRows/withPlanTransaction.js";
import {
	markCustomersUpdatedAtByInternalIds,
	markCustomerUpdatedAt,
} from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

// One connection: a mark that checks out a second client inside the transaction starves.
const { db, client } = initDrizzle({ maxConnections: 1 });

const orgId = `lsn_deferred_org_${Date.now()}`;
const env = "sandbox";
const ctx = { db } as unknown as AutumnContext;

const ledgerCustomerIds = async (): Promise<string[]> =>
	(
		await db.execute<{ customer_id: string }>(sql`
			SELECT customer_id FROM customer_lsns WHERE org_id = ${orgId} AND env = ${env} ORDER BY customer_id
		`)
	).map((row) => row.customer_id);

const insertCustomer = ({
	tx,
	customerId,
}: {
	tx: DrizzleCli;
	customerId: string;
}) =>
	tx.execute(sql`
		INSERT INTO customers (internal_id, id, org_id, env, created_at, name)
		VALUES (${`internal_${customerId}`}, ${customerId}, ${orgId}, ${env}, ${Date.now()}, 'deferred mark test')
	`);

const inPlanTransaction = (run: (tx: DrizzleCli) => Promise<unknown>) =>
	withAutocommitDb({
		db,
		run: () =>
			withPlanTransaction({
				ctx,
				run: (transactionCtx) => run(transactionCtx.db),
			}),
	});

beforeAll(async () => {
	if (!process.env.DATABASE_URL) return;
	await OrgService.create({
		db,
		id: orgId,
		slug: orgId,
		name: "deferred marks test",
	});
});

afterAll(async () => {
	if (!process.env.DATABASE_URL) return;
	await db.execute(sql`DELETE FROM customer_lsns WHERE org_id = ${orgId}`);
	await db.execute(sql`DELETE FROM customers WHERE org_id = ${orgId}`);
	await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
	await client.end();
});

describe.skipIf(!process.env.DATABASE_URL)(
	"freshness marks in a plan transaction (real DB)",
	() => {
		it("a mark inside the transaction needs no second connection", async () => {
			const startedAt = Date.now();
			await inPlanTransaction((tx) =>
				markCustomerUpdatedAt({
					db: tx,
					orgId,
					env,
					customerId: "cus_one_conn",
				}),
			);
			// A starved mark waits out two 5s checkout timeouts before giving up.
			expect(Date.now() - startedAt).toBeLessThan(5_000);
			expect(await ledgerCustomerIds()).toContain("cus_one_conn");
		}, 20_000);

		it("marks land after commit, for customers the transaction created", async () => {
			let insideLedger: string[] = [];
			await inPlanTransaction(async (tx) => {
				await insertCustomer({ tx, customerId: "cus_after_commit" });
				await markCustomersUpdatedAtByInternalIds({
					db: tx,
					internalCustomerIds: ["internal_cus_after_commit"],
				});
				insideLedger = (
					await tx.execute<{ customer_id: string }>(sql`
						SELECT customer_id FROM customer_lsns WHERE org_id = ${orgId}
					`)
				).map((row) => row.customer_id);
			});
			expect(insideLedger).not.toContain("cus_after_commit");
			expect(await ledgerCustomerIds()).toContain("cus_after_commit");
		});

		it("marks are dropped when the transaction rolls back", async () => {
			const outcome = await inPlanTransaction(async (tx) => {
				await markCustomerUpdatedAt({
					db: tx,
					orgId,
					env,
					customerId: "cus_rolled_back",
				});
				throw new Error("rollback");
			}).catch((error: Error) => error.message);
			expect(outcome).toBe("rollback");
			expect(await ledgerCustomerIds()).not.toContain("cus_rolled_back");
		});

		it("outside a plan transaction a mark writes immediately", async () => {
			await withAutocommitDb({
				db,
				run: () =>
					markCustomerUpdatedAt({
						db,
						orgId,
						env,
						customerId: "cus_immediate",
					}),
			});
			expect(await ledgerCustomerIds()).toContain("cus_immediate");
		});
	},
);
