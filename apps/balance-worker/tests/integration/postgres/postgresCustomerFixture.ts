import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MeteringIdentity } from "@autumn/balance-engine";
import { createPostgresClient, type PostgresClient } from "@autumn/postgres";
import {
	EntInterval,
	PooledBalanceResetMode,
	RolloverExpiryDurationType,
	schemas,
} from "@autumn/shared";
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

export type SeededPool = {
	pooledBalanceId: string;
	poolCustomerEntitlementId: string;
	readGranted(): Promise<number>;
	readBalance(): Promise<number>;
	readNextResetAt(): Promise<number | null>;
	readContributions(): Promise<
		{ id: string; current: number; effective_at: number | null }[]
	>;
	cleanup(): Promise<void>;
};

export type SeededCustomer = {
	identity: MeteringIdentity;
	internalCustomerId: string;
	internalFeatureId: string;
	customerProductId: string;
	entitlementId: string;
	orgId: string;
	env: string;
	featureId: string;
	customerEntitlementId: string;
	balance: number;
	readBalance(): Promise<number>;
	readNextResetAt(): Promise<number | null>;
	readRollovers(): Promise<{ balance: number; expires_at: number | null }[]>;
	readNextOffset(params: {
		topic: string;
		partition: number;
	}): Promise<bigint | null>;
	readCommandNextOffset(params: {
		topic: string;
		partition: number;
	}): Promise<bigint | null>;
	/** Removes the grant row as a legacy writer would; `restoreGrant` puts it back with the given balance. */
	deleteGrant(): Promise<void>;
	restoreGrant(params: { balance: number }): Promise<void>;
	cleanup(): Promise<void>;
};

/** One org, customer, feature, product and a monthly grant, all under a unique suffix; cleanup removes them. */
export async function seedCustomer({
	postgres,
	balance = 100,
	allowance = balance,
	nextResetAt = null,
	billingCycleAnchor,
	rolloverMax,
}: {
	postgres: PostgresClient;
	balance?: number;
	/** The grant's refill amount; defaults to the seeded balance. */
	allowance?: number;
	/** The cycle end already on the row; null seeds a row that never resets. */
	nextResetAt?: number | null;
	/** Seeds a subscription with this billing anchor and links the plan to it. */
	billingCycleAnchor?: number;
	/** The grant carries unused balance over, capped at this many units. */
	rolloverMax?: number;
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
	const subscriptionId = `sub_${suffix}`;
	const stripeSubscriptionId = `sub_stripe_${suffix}`;
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
		allowance,
		interval: "month",
		rollover:
			rolloverMax === undefined
				? null
				: {
						max: rolloverMax,
						duration: RolloverExpiryDurationType.Month,
						length: 1,
					},
	});
	if (billingCycleAnchor !== undefined) {
		await db.insert(schemas.subscriptions).values({
			id: subscriptionId,
			org_id: orgId,
			env,
			stripe_id: stripeSubscriptionId,
			created_at: now,
			billing_cycle_anchor_seconds: Math.round(billingCycleAnchor / 1000),
		});
	}
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
		subscription_ids:
			billingCycleAnchor === undefined ? null : [stripeSubscriptionId],
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
			next_reset_at: nextResetAt,
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

	async function readNextResetAt(): Promise<number | null> {
		const rows = await db.execute(
			sql`SELECT next_reset_at FROM customer_entitlements WHERE id = ${customerEntitlementId}`,
		);
		const value = rows[0]?.next_reset_at;
		return value === undefined || value === null ? null : Number(value);
	}

	async function readRollovers(): Promise<
		{ balance: number; expires_at: number | null }[]
	> {
		const rows = await db.execute(
			sql`SELECT balance, expires_at FROM rollovers WHERE cus_ent_id = ${customerEntitlementId} ORDER BY expires_at`,
		);
		return rows.map((row) => ({
			balance: Number(row.balance),
			expires_at: row.expires_at === null ? null : Number(row.expires_at),
		}));
	}

	async function readProgressColumn({
		column,
		topic,
		partition,
	}: {
		column: "next_offset" | "command_next_offset";
		topic: string;
		partition: number;
	}): Promise<bigint | null> {
		const rows = await db.execute(
			sql`SELECT ${sql.identifier(column)} AS value FROM partition_progress WHERE topic = ${topic} AND partition_id = ${partition}`,
		);
		const value = rows[0]?.value;
		return value === undefined || value === null ? null : BigInt(String(value));
	}

	function readNextOffset(position: { topic: string; partition: number }) {
		return readProgressColumn({ column: "next_offset", ...position });
	}

	function readCommandNextOffset(position: {
		topic: string;
		partition: number;
	}) {
		return readProgressColumn({ column: "command_next_offset", ...position });
	}

	async function cleanup(): Promise<void> {
		await db.execute(
			sql`DELETE FROM rollovers WHERE cus_ent_id = ${customerEntitlementId}`,
		);
		await db.execute(
			sql`DELETE FROM customer_entitlements WHERE id = ${customerEntitlementId}`,
		);
		await db.execute(
			sql`DELETE FROM customer_products WHERE id = ${customerProductId}`,
		);
		await db.execute(
			sql`DELETE FROM subscriptions WHERE id = ${subscriptionId}`,
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
		internalCustomerId,
		internalFeatureId,
		customerProductId,
		entitlementId,
		orgId,
		env,
		featureId,
		customerEntitlementId,
		balance,
		readBalance,
		readNextResetAt,
		readRollovers,
		readNextOffset,
		readCommandNextOffset,
		deleteGrant,
		restoreGrant,
		cleanup,
	};
}

/**
 * A subscription-keyed pool on the customer's feature: the pool row, its synthetic cusEnt, and one contribution
 * per source, each source a cusEnt of its own that the worker never loads. Cleanup removes them all.
 */
export async function seedPool({
	postgres,
	customer,
	granted,
	balance,
	nextResetAt,
	contributions,
}: {
	postgres: PostgresClient;
	customer: SeededCustomer;
	granted: number;
	balance: number;
	nextResetAt: number;
	contributions: {
		current: number;
		next: number;
		effectiveAt: number | null;
	}[];
}): Promise<SeededPool> {
	const suffix = crypto.randomUUID().slice(0, 8);
	const now = Date.now();
	const pooledBalanceId = `pb_${suffix}`;
	const poolCustomerEntitlementId = `ce_pool_${suffix}`;
	const sourceIds = contributions.map(
		(_, index) => `ce_src_${suffix}_${index}`,
	);
	const contributionIds = contributions.map(
		(_, index) => `pbc_${suffix}_${index}`,
	);
	const { db } = postgres;

	await db.insert(schemas.customerEntitlements).values({
		id: poolCustomerEntitlementId,
		internal_customer_id: customer.internalCustomerId,
		customer_id: customer.identity.customerId,
		customer_product_id: null,
		entitlement_id: customer.entitlementId,
		internal_feature_id: customer.internalFeatureId,
		feature_id: customer.featureId,
		created_at: now,
		balance,
		adjustment: 0,
		next_reset_at: nextResetAt,
		is_pooled_balance: true,
		pooled_balance_id: pooledBalanceId,
	});
	await db.insert(schemas.pooledBalances).values({
		id: pooledBalanceId,
		org_id: customer.orgId,
		env: customer.env,
		internal_customer_id: customer.internalCustomerId,
		internal_feature_id: customer.internalFeatureId,
		granted,
		interval: EntInterval.Month,
		reset_mode: PooledBalanceResetMode.Subscription,
		customer_entitlement_id: poolCustomerEntitlementId,
		created_at: now,
		updated_at: now,
	});
	for (const [index, contribution] of contributions.entries()) {
		await db.insert(schemas.customerEntitlements).values({
			id: sourceIds[index],
			internal_customer_id: customer.internalCustomerId,
			customer_id: customer.identity.customerId,
			customer_product_id: customer.customerProductId,
			entitlement_id: customer.entitlementId,
			internal_feature_id: customer.internalFeatureId,
			feature_id: customer.featureId,
			created_at: now,
			balance: 0,
			adjustment: 0,
			pooled_contribution_id: contributionIds[index],
		});
		await db.insert(schemas.pooledBalanceContributions).values({
			id: contributionIds[index],
			pooled_balance_id: pooledBalanceId,
			source_customer_product_id: customer.customerProductId,
			source_customer_entitlement_id: sourceIds[index],
			current_contribution: contribution.current,
			next_cycle_contribution: contribution.next,
			effective_at: contribution.effectiveAt,
			created_at: now,
			updated_at: now,
		});
	}

	async function readGranted(): Promise<number> {
		const rows = await db.execute(
			sql`SELECT granted FROM pooled_balances WHERE id = ${pooledBalanceId}`,
		);
		return Number(rows[0]?.granted);
	}
	async function readBalance(): Promise<number> {
		const rows = await db.execute(
			sql`SELECT balance FROM customer_entitlements WHERE id = ${poolCustomerEntitlementId}`,
		);
		return Number(rows[0]?.balance);
	}
	async function readNextResetAt(): Promise<number | null> {
		const rows = await db.execute(
			sql`SELECT next_reset_at FROM customer_entitlements WHERE id = ${poolCustomerEntitlementId}`,
		);
		const value = rows[0]?.next_reset_at;
		return value === undefined || value === null ? null : Number(value);
	}
	async function readContributions() {
		const rows = await db.execute(
			sql`SELECT id, current_contribution, effective_at FROM pooled_balance_contributions WHERE pooled_balance_id = ${pooledBalanceId} ORDER BY id`,
		);
		return rows.map((row) => ({
			id: String(row.id),
			current: Number(row.current_contribution),
			effective_at: row.effective_at === null ? null : Number(row.effective_at),
		}));
	}
	async function cleanup(): Promise<void> {
		await db.execute(
			sql`DELETE FROM pooled_balance_contributions WHERE pooled_balance_id = ${pooledBalanceId}`,
		);
		await db.execute(
			sql`DELETE FROM pooled_balances WHERE id = ${pooledBalanceId}`,
		);
		await db.execute(
			sql`DELETE FROM customer_entitlements WHERE id = ${poolCustomerEntitlementId} OR pooled_contribution_id = ANY(string_to_array(${contributionIds.join(",")}, ','))`,
		);
	}

	return {
		pooledBalanceId,
		poolCustomerEntitlementId,
		readGranted,
		readBalance,
		readNextResetAt,
		readContributions,
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
