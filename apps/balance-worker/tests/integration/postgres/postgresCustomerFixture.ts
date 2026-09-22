import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MeteringIdentity } from "@autumn/balance-engine";
import { createPostgresClient, type PostgresClient } from "@autumn/postgres";
import { schemas } from "@autumn/shared";
import { sql } from "drizzle-orm";

/** The worktree's own Postgres branch, the same one `bun db migrate` targets. */
export function readWorktreeDatabaseUrl(): string | null {
	const fromEnv = process.env.BALANCE_WORKER_DATABASE_URL?.trim();
	if (fromEnv) return fromEnv;
	try {
		const envLocal = readFileSync(
			resolve(import.meta.dir, "../../../../../server/.env.local"),
			"utf8",
		);
		return envLocal.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim() ?? null;
	} catch {
		return null;
	}
}

export type SeededCustomer = {
	identity: MeteringIdentity;
	featureId: string;
	internalFeatureId: string;
	customerEntitlementId: string;
	balance: number;
	readBalance(): Promise<number>;
	readNextOffset(params: {
		topic: string;
		partition: number;
	}): Promise<bigint | null>;
	/** Removes the grant row as a legacy writer would; `restoreGrant` puts it back with the given balance. */
	deleteGrant(): Promise<void>;
	restoreGrant(params: { balance: number }): Promise<void>;
	cleanup(): Promise<void>;
};

/** One org, customer, feature, product and a 100-balance grant, all under a unique suffix; cleanup removes them. */
export async function seedCustomer({
	postgres,
	balance = 100,
}: {
	postgres: PostgresClient;
	balance?: number;
}): Promise<SeededCustomer> {
	const suffix = crypto.randomUUID().slice(0, 8);
	const now = Date.now();
	const orgId = `org_pgtest_${suffix}`;
	const env = "sandbox";
	const internalCustomerId = `cus_int_${suffix}`;
	const customerId = `cus_pgtest_${suffix}`;
	const internalFeatureId = `feat_int_${suffix}`;
	const featureId = "messages";
	const internalProductId = `prod_int_${suffix}`;
	const entitlementId = `ent_${suffix}`;
	const customerProductId = `cp_${suffix}`;
	const customerEntitlementId = `ce_${suffix}`;
	const { db } = postgres;

	await db.insert(schemas.organizations).values({
		id: orgId,
		slug: orgId,
		name: orgId,
		createdAt: new Date(now),
	});
	await db.insert(schemas.customers).values({
		internal_id: internalCustomerId,
		id: customerId,
		org_id: orgId,
		env,
		created_at: now,
		name: customerId,
	});
	await db.insert(schemas.features).values({
		internal_id: internalFeatureId,
		id: featureId,
		org_id: orgId,
		env,
		name: "Messages",
		type: "metered",
		created_at: now,
	});
	await db.insert(schemas.products).values({
		internal_id: internalProductId,
		id: "pro",
		org_id: orgId,
		env,
		name: "Pro",
		created_at: now,
	});
	await db.insert(schemas.entitlements).values({
		id: entitlementId,
		org_id: orgId,
		internal_feature_id: internalFeatureId,
		internal_product_id: internalProductId,
		feature_id: featureId,
		created_at: now,
		allowance_type: "fixed",
		allowance: balance,
		interval: "month",
	});
	await db.insert(schemas.customerProducts).values({
		id: customerProductId,
		internal_customer_id: internalCustomerId,
		internal_product_id: internalProductId,
		product_id: "pro",
		created_at: now,
		starts_at: now,
		status: "active",
		options: [],
		billing_version: "v2",
	});
	async function restoreGrant({
		balance: restoredBalance,
	}: {
		balance: number;
	}): Promise<void> {
		await db.insert(schemas.customerEntitlements).values({
			id: customerEntitlementId,
			internal_customer_id: internalCustomerId,
			customer_id: customerId,
			customer_product_id: customerProductId,
			entitlement_id: entitlementId,
			internal_feature_id: internalFeatureId,
			feature_id: featureId,
			created_at: now,
			balance: restoredBalance,
			adjustment: 0,
		});
	}
	await restoreGrant({ balance });

	async function deleteGrant(): Promise<void> {
		await db.execute(
			sql`DELETE FROM customer_entitlements WHERE id = ${customerEntitlementId}`,
		);
	}

	async function readBalance(): Promise<number> {
		const rows = await db.execute(
			sql`SELECT balance FROM customer_entitlements WHERE id = ${customerEntitlementId}`,
		);
		return Number(rows[0]?.balance);
	}

	async function readNextOffset({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): Promise<bigint | null> {
		const rows = await db.execute(
			sql`SELECT next_offset FROM partition_progress WHERE topic = ${topic} AND partition_id = ${partition}`,
		);
		const value = rows[0]?.next_offset;
		return value === undefined || value === null ? null : BigInt(String(value));
	}

	async function cleanup(): Promise<void> {
		await db.execute(
			sql`DELETE FROM customer_entitlements WHERE id = ${customerEntitlementId}`,
		);
		await db.execute(
			sql`DELETE FROM customer_products WHERE id = ${customerProductId}`,
		);
		await db.execute(sql`DELETE FROM entitlements WHERE id = ${entitlementId}`);
		await db.execute(
			sql`DELETE FROM products WHERE internal_id = ${internalProductId}`,
		);
		await db.execute(
			sql`DELETE FROM features WHERE internal_id = ${internalFeatureId}`,
		);
		await db.execute(
			sql`DELETE FROM customers WHERE internal_id = ${internalCustomerId}`,
		);
		await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
	}

	return {
		identity: { orgId, env, customerId, entityId: null },
		featureId,
		internalFeatureId,
		customerEntitlementId,
		balance,
		readBalance,
		readNextOffset,
		deleteGrant,
		restoreGrant,
		cleanup,
	};
}

export function openFixturePostgres({
	databaseUrl,
}: {
	databaseUrl: string;
}): PostgresClient {
	return createPostgresClient({
		config: {
			databaseUrl,
			maxConnections: 2,
			connectTimeout: 10,
			idleTimeout: 30,
			maxLifetime: 1800,
		},
	});
}
