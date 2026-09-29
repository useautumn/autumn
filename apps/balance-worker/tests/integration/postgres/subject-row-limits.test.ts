import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	getSubjectRows,
	type PostgresClient,
	SUBJECT_ROW_LIMITS,
} from "@autumn/postgres";
import { sql } from "drizzle-orm";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
	type SeededCustomer,
	seedCustomer,
} from "./postgresCustomerFixture.js";

const databaseUrl = readWorktreeDatabaseUrl();

describe.skipIf(!databaseUrl)("subject row limits", () => {
	let postgres: PostgresClient;

	beforeAll(() => {
		if (!databaseUrl) throw new Error("No worktree DATABASE_URL");
		postgres = openFixturePostgres({ databaseUrl });
	});

	afterAll(async () => {
		await postgres?.close();
	});

	const loadCustomer = async ({ seeded }: { seeded: SeededCustomer }) => {
		const envelope = await getSubjectRows({
			ctx: { db: postgres.db, orgId: seeded.orgId, env: seeded.env },
			customerId: seeded.identity.customerId,
			asOfTimestampMs: Date.now(),
		});
		if (!envelope) throw new Error("customer not found");
		return envelope;
	};

	test("live products are capped at the newest, their prices and grants following the survivors", async () => {
		const seeded = await seedCustomer({ postgres });
		const cap = SUBJECT_ROW_LIMITS.customerProducts;
		const prefix = `cp_cap_${crypto.randomUUID().slice(0, 8)}`;
		// One more than the cap, each newer than the seeded product and one another; ids zero-padded so id order is age order.
		await postgres.db.execute(sql`INSERT INTO customer_products
			(id, internal_customer_id, internal_product_id, product_id, created_at, starts_at, status, options, billing_version)
			SELECT ${prefix} || '_' || lpad(n::text, 4, '0'), ${seeded.internalCustomerId}, ${seeded.internalProductId}, 'pro',
				${Date.now()} + n, ${Date.now()} + n, 'active', ARRAY[]::jsonb[], 'v2'
			FROM generate_series(1, ${cap + 1}) AS n`);
		try {
			const envelope = await loadCustomer({ seeded });
			const kept = envelope.customer_products.map(({ id }) => id);

			expect(kept).toHaveLength(cap);
			// The seeded product and the oldest inserted one are the two that fall off.
			expect(kept).not.toContain(seeded.customerProductId);
			expect(kept).not.toContain(`${prefix}_0001`);
			expect(kept[0]).toBe(`${prefix}_${String(cap + 1).padStart(4, "0")}`);
			expect(envelope.customer_entitlements.map(({ id }) => id)).not.toContain(
				seeded.customerEntitlementId,
			);
		} finally {
			await postgres.db.execute(
				sql`DELETE FROM customer_products WHERE id LIKE ${`${prefix}_%`}`,
			);
			await seeded.cleanup();
		}
	});

	test("loose grants are capped at the newest ids", async () => {
		const seeded = await seedCustomer({ postgres });
		const cap = SUBJECT_ROW_LIMITS.looseCustomerEntitlements;
		const prefix = `ce_cap_${crypto.randomUUID().slice(0, 8)}`;
		await postgres.db.execute(sql`INSERT INTO customer_entitlements
			(id, internal_customer_id, customer_id, entitlement_id, internal_feature_id, feature_id, created_at, balance, adjustment)
			SELECT ${prefix} || '_' || lpad(n::text, 4, '0'), ${seeded.internalCustomerId}, ${seeded.identity.customerId},
				${seeded.entitlementId}, ${seeded.internalFeatureId}, ${seeded.featureId}, ${Date.now()} + n, 1, 0
			FROM generate_series(1, ${cap + 1}) AS n`);
		try {
			const envelope = await loadCustomer({ seeded });
			const loose = envelope.customer_entitlements
				.filter(({ customer_product_id }) => customer_product_id === null)
				.map(({ id }) => id);

			expect(loose).toHaveLength(cap);
			expect(loose).not.toContain(`${prefix}_0001`);
			expect(loose).toContain(`${prefix}_${String(cap + 1).padStart(4, "0")}`);
			// The product's own grant is never counted against the loose cap.
			expect(envelope.customer_entitlements.map(({ id }) => id)).toContain(
				seeded.customerEntitlementId,
			);
		} finally {
			await postgres.db.execute(
				sql`DELETE FROM customer_entitlements WHERE id LIKE ${`${prefix}_%`}`,
			);
			await seeded.cleanup();
		}
	});
});
