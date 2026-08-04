/**
 * customer_lsns freshness ledger: structural write flows must stamp the ledger.
 *
 * Contract under test:
 *   - customers.create (createWithDefaults) upserts a customer_lsns row keyed
 *     (org_id, env, customer_id) with internal_customer_id resolved
 *   - customers.update moves updated_at forward (Postgres now(), upsert not insert)
 *   - marks make isCustomerRecentlyUpdated true (primary-routing signal)
 *   - customers.delete still marks (deleted customers read fresh 404s)
 */

import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { isCustomerRecentlyUpdated } from "@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js";
import { markCustomersUpdatedAtByInternalIds } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

const createClients = async () => {
	const orgSlug = process.env.TESTS_ORG || "unit-test-org";
	const orgSecretKey = process.env.UNIT_TEST_AUTUMN_SECRET_KEY;
	if (!orgSecretKey) throw new Error("UNIT_TEST_AUTUMN_SECRET_KEY is required");

	const { db } = initDrizzle();
	const org = await OrgService.getBySlug({ db, slug: orgSlug });
	if (!org) throw new Error(`Org ${orgSlug} not found`);

	const autumn = new AutumnInt({ secretKey: orgSecretKey });

	return { autumn, db, org };
};

type LedgerRow = { internal_customer_id: string | null; updated_at: string };

test.concurrent(
	`${chalk.yellowBright("customer_lsns: create/update/delete flows stamp the freshness ledger")}`,
	async () => {
		const customerId = "cus-lsns-freshness";
		const { autumn, db, org } = await createClients();
		const env = AppEnv.Sandbox;

		const fetchRow = async (): Promise<LedgerRow | undefined> => {
			const rows = await db.execute<LedgerRow>(sql`
				SELECT internal_customer_id, updated_at::text
				FROM customer_lsns
				WHERE org_id = ${org.id} AND env = ${env} AND customer_id = ${customerId}
			`);
			return rows[0];
		};

		try {
			await autumn.customers.delete(customerId);
		} catch {
			// ignore missing
		}

		await autumn.customers.create({
			id: customerId,
			name: "before",
			email: `${customerId}@example.com`,
		});

		const afterCreate = await fetchRow();
		expect(afterCreate).toBeDefined();
		expect(afterCreate?.internal_customer_id).toBeTruthy();
		expect(
			await isCustomerRecentlyUpdated({
				db,
				orgId: org.id,
				env,
				customerId,
			}),
		).toBe(true);

		await new Promise((resolve) => setTimeout(resolve, 50));
		await autumn.customers.update(customerId, { name: "after" });

		const afterUpdate = await fetchRow();
		expect(afterUpdate).toBeDefined();
		expect(new Date(afterUpdate!.updated_at).getTime()).toBeGreaterThan(
			new Date(afterCreate!.updated_at).getTime(),
		);

		// Batch mark resolves (org, env, id) through customers by internal id —
		// the path entity/cusProduct/cusEnt service chokepoints use.
		await new Promise((resolve) => setTimeout(resolve, 50));
		await markCustomersUpdatedAtByInternalIds({
			db,
			internalCustomerIds: [afterUpdate!.internal_customer_id],
		});

		const afterBatchMark = await fetchRow();
		expect(afterBatchMark).toBeDefined();
		expect(new Date(afterBatchMark!.updated_at).getTime()).toBeGreaterThan(
			new Date(afterUpdate!.updated_at).getTime(),
		);

		await new Promise((resolve) => setTimeout(resolve, 50));
		await autumn.customers.delete(customerId);

		const afterDelete = await fetchRow();
		expect(afterDelete).toBeDefined();
		expect(new Date(afterDelete!.updated_at).getTime()).toBeGreaterThan(
			new Date(afterBatchMark!.updated_at).getTime(),
		);
	},
);
