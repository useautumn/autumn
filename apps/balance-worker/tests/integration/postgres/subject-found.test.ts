import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	getEntitySubjectRows,
	getSubjectRows,
	type PostgresClient,
} from "@autumn/postgres";
import { schemas } from "@autumn/shared";
import { sql } from "drizzle-orm";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
	type SeededCustomer,
	seedCustomer,
} from "./postgresCustomerFixture.js";

const databaseUrl = readWorktreeDatabaseUrl();

describe.skipIf(!databaseUrl)("a subject that exists reads as found", () => {
	let postgres: PostgresClient;

	beforeAll(() => {
		if (!databaseUrl) throw new Error("No worktree DATABASE_URL");
		postgres = openFixturePostgres({ databaseUrl });
	});

	afterAll(async () => {
		await postgres?.close();
	});

	const readRows = ({
		seeded,
		entityId = null,
	}: {
		seeded: SeededCustomer;
		entityId?: string | null;
	}) =>
		getSubjectRows({
			ctx: { db: postgres.db, orgId: seeded.orgId, env: seeded.env },
			customerId: seeded.identity.customerId,
			entityId,
			asOfTimestampMs: Date.now(),
		});

	const readEntityIds = async ({
		seeded,
		entityIds,
	}: {
		seeded: SeededCustomer;
		entityIds: string[];
	}) =>
		(
			await getEntitySubjectRows({
				ctx: { db: postgres.db, orgId: seeded.orgId, env: seeded.env },
				customerId: seeded.identity.customerId,
				entityIds,
				asOfTimestampMs: Date.now(),
			})
		).map((envelope) => envelope.entity?.id);

	const seedBareEntity = async ({ seeded }: { seeded: SeededCustomer }) => {
		const entityId = `ent_bare_${crypto.randomUUID().slice(0, 8)}`;
		await postgres.db.insert(schemas.entities).values({
			id: entityId,
			internal_id: `${entityId}_int`,
			internal_customer_id: seeded.internalCustomerId,
			org_id: seeded.orgId,
			env: seeded.env,
			created_at: Date.now(),
			name: "Bare",
			feature_id: seeded.featureId,
			internal_feature_id: seeded.internalFeatureId,
		});
		return {
			entityId,
			cleanup: () =>
				postgres.db.execute(sql`DELETE FROM entities WHERE id = ${entityId}`),
		};
	};

	test("a customer with no products and no balances is found, with no rows", async () => {
		const seeded = await seedCustomer({ postgres });
		try {
			await seeded.deleteGrant();
			await postgres.db.execute(
				sql`DELETE FROM customer_products WHERE id = ${seeded.customerProductId}`,
			);

			const rows = await readRows({ seeded });

			expect(rows?.customer.id).toBe(seeded.identity.customerId);
			expect(rows?.customer_products).toEqual([]);
			expect(rows?.customer_entitlements).toEqual([]);
		} finally {
			await seeded.cleanup();
		}
	});

	test("a customer whose only grant expired is found", async () => {
		const seeded = await seedCustomer({ postgres });
		try {
			await postgres.db.execute(
				sql`UPDATE customer_entitlements SET expires_at = ${Date.now() - 60_000} WHERE id = ${seeded.customerEntitlementId}`,
			);

			const rows = await readRows({ seeded });

			expect(rows?.customer.id).toBe(seeded.identity.customerId);
		} finally {
			await seeded.cleanup();
		}
	});

	test("an entity with no balances of its own is found, alone and in a batched read", async () => {
		const seeded = await seedCustomer({ postgres });
		const bare = await seedBareEntity({ seeded });
		try {
			const rows = await readRows({ seeded, entityId: bare.entityId });

			expect(rows?.entity?.id).toBe(bare.entityId);
			expect(
				await readEntityIds({ seeded, entityIds: [bare.entityId] }),
			).toEqual([bare.entityId]);
		} finally {
			await bare.cleanup();
			await seeded.cleanup();
		}
	});

	test("only a missing row is not found: a deleted customer, and an entity id the customer does not have", async () => {
		const seeded = await seedCustomer({ postgres });
		const bare = await seedBareEntity({ seeded });
		try {
			expect(await readRows({ seeded, entityId: "ent_not_its" })).toBeNull();
			expect(
				await readEntityIds({ seeded, entityIds: ["ent_not_its"] }),
			).toEqual([]);

			await bare.cleanup();
			await seeded.cleanup();

			expect(await readRows({ seeded })).toBeNull();
			expect(await readRows({ seeded, entityId: bare.entityId })).toBeNull();
		} finally {
			await bare.cleanup();
			await seeded.cleanup();
		}
	});
});
