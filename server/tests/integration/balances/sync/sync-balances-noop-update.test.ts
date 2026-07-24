import { expect, test } from "bun:test";
import pg, { type PoolClient } from "pg";

type CustomerEntitlementSyncRow = {
	id: string;
	balance: string;
	adjustment: string | null;
	entities: Record<string, unknown> | null;
	next_reset_at: string | null;
	cache_version: number | null;
	tuple_id: string;
};

const createCustomerEntitlementFixture = async ({
	client,
}: {
	client: PoolClient;
}) => {
	const suffix = crypto.randomUUID();
	const organizationId = `org_sync_noop_${suffix}`;
	const featureId = `feature_sync_noop_${suffix}`;
	const internalFeatureId = `feat_sync_noop_${suffix}`;
	const entitlementId = `ent_sync_noop_${suffix}`;
	const customerEntitlementId = `ce_sync_noop_${suffix}`;
	const createdAt = Date.now();

	await client.query(
		`
			INSERT INTO organizations (id, slug, name, "createdAt")
			VALUES ($1, $2, 'Sync no-op test', NOW())
		`,
		[organizationId, organizationId],
	);
	await client.query(
		`
			INSERT INTO features (
				internal_id, org_id, created_at, env, id, name, type, config
			)
			VALUES ($1, $2, $3, 'sandbox', $4, 'Sync no-op feature', 'metered', '{}')
		`,
		[internalFeatureId, organizationId, createdAt, featureId],
	);
	await client.query(
		`
			INSERT INTO entitlements (
				id, created_at, internal_feature_id, allowance_type, allowance,
				org_id, feature_id
			)
			VALUES ($1, $2, $3, 'fixed', 100, $4, $5)
		`,
		[entitlementId, createdAt, internalFeatureId, organizationId, featureId],
	);
	await client.query(
		`
			INSERT INTO customer_entitlements (
				id, entitlement_id, internal_customer_id, internal_feature_id,
				balance, created_at, adjustment, entities, cache_version,
				customer_id, feature_id
			)
			VALUES ($1, $2, $3, $4, 100, $5, NULL, '{"scope": 1}', 0, $6, $7)
		`,
		[
			customerEntitlementId,
			entitlementId,
			`customer_sync_noop_${suffix}`,
			internalFeatureId,
			createdAt,
			`customer_sync_noop_${suffix}`,
			featureId,
		],
	);

	return customerEntitlementId;
};

const readCustomerEntitlement = async ({
	client,
	customerEntitlementId,
}: {
	client: PoolClient;
	customerEntitlementId: string;
}) => {
	const result = await client.query<CustomerEntitlementSyncRow>(
		`
			SELECT
				id,
				balance,
				adjustment,
				entities,
				next_reset_at,
				cache_version,
				ctid::text AS tuple_id
			FROM customer_entitlements
			WHERE id = $1
		`,
		[customerEntitlementId],
	);

	const customerEntitlement = result.rows[0];
	expect(customerEntitlement).toBeDefined();
	if (!customerEntitlement) {
		throw new Error("Expected the customer entitlement fixture to exist");
	}

	return customerEntitlement;
};

const syncCustomerEntitlement = async ({
	client,
	customerEntitlement,
	balance,
}: {
	client: PoolClient;
	customerEntitlement: CustomerEntitlementSyncRow;
	balance: string | number;
}) => {
	const entities = customerEntitlement.entities;
	await client.query("SELECT sync_balances_v2($1::jsonb)", [
		JSON.stringify({
			customer_entitlement_updates: [
				{
					customer_entitlement_id: customerEntitlement.id,
					balance,
					adjustment: customerEntitlement.adjustment,
					entities,
					next_reset_at: customerEntitlement.next_reset_at,
					entity_count: entities ? Object.keys(entities).length : 0,
					cache_version: customerEntitlement.cache_version ?? 0,
				},
			],
			rollover_updates: [],
			usage_window_updates: [],
		}),
	]);
};

test("sync_balances_v2 skips unchanged customer entitlement updates", async () => {
	const pool = new pg.Pool({
		connectionString: process.env.DATABASE_URL,
		max: 1,
	});
	const client = await pool.connect();

	try {
		await client.query("BEGIN");

		const customerEntitlementId = await createCustomerEntitlementFixture({
			client,
		});
		const initialCustomerEntitlement = await readCustomerEntitlement({
			client,
			customerEntitlementId,
		});
		await syncCustomerEntitlement({
			client,
			customerEntitlement: initialCustomerEntitlement,
			balance: initialCustomerEntitlement.balance,
		});

		const unchangedCustomerEntitlement = await readCustomerEntitlement({
			client,
			customerEntitlementId,
		});
		expect(unchangedCustomerEntitlement.tuple_id).toBe(
			initialCustomerEntitlement.tuple_id,
		);

		const changedBalance = Number(unchangedCustomerEntitlement.balance) - 1;
		await syncCustomerEntitlement({
			client,
			customerEntitlement: unchangedCustomerEntitlement,
			balance: changedBalance,
		});

		const changedCustomerEntitlement = await readCustomerEntitlement({
			client,
			customerEntitlementId,
		});
		expect(Number(changedCustomerEntitlement.balance)).toBe(changedBalance);
		expect(changedCustomerEntitlement.tuple_id).not.toBe(
			unchangedCustomerEntitlement.tuple_id,
		);

		await syncCustomerEntitlement({
			client,
			customerEntitlement: {
				...changedCustomerEntitlement,
				adjustment: "1",
			},
			balance: changedCustomerEntitlement.balance,
		});

		const adjustedCustomerEntitlement = await readCustomerEntitlement({
			client,
			customerEntitlementId,
		});
		expect(Number(adjustedCustomerEntitlement.adjustment)).toBe(1);
		expect(adjustedCustomerEntitlement.tuple_id).not.toBe(
			changedCustomerEntitlement.tuple_id,
		);

		await syncCustomerEntitlement({
			client,
			customerEntitlement: {
				...adjustedCustomerEntitlement,
				entities: { scope: 2 },
			},
			balance: adjustedCustomerEntitlement.balance,
		});

		const updatedEntitiesCustomerEntitlement = await readCustomerEntitlement({
			client,
			customerEntitlementId,
		});
		expect(updatedEntitiesCustomerEntitlement.entities).toEqual({ scope: 2 });
		expect(updatedEntitiesCustomerEntitlement.tuple_id).not.toBe(
			adjustedCustomerEntitlement.tuple_id,
		);
	} finally {
		await client.query("ROLLBACK");
		client.release();
		await pool.end();
	}
});
