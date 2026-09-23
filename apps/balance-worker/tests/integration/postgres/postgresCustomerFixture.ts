import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
	ApplyBillingPlanRequest,
	CatalogRow,
	MeteringIdentity,
} from "@autumn/balance-engine";
import {
	createPostgresClient,
	getCatalogRows,
	type PostgresClient,
} from "@autumn/postgres";
import {
	AppEnv,
	BillingVersion,
	CollectionMethod,
	CusProductStatus,
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
	internalProductId: string;
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
		internalProductId,
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

export type PlannedCustomer = {
	identity: MeteringIdentity;
	internalCustomerId: string;
	customerProductId: string;
	customerEntitlementId: string;
	/** The plan that creates the customer; `customerProductId` overrides the product row's id. */
	request(params: {
		commandId: string;
		customerProductId?: string;
	}): ApplyBillingPlanRequest;
	/** A plan updating the created rows: the Stripe customer on the customer, a subscription on the product. */
	linkBackRequest(params: {
		commandId: string;
		customerProductId?: string;
	}): ApplyBillingPlanRequest;
	/** Any ops on this customer (and the entities named), as one plan. */
	opsRequest(params: {
		commandId: string;
		entityIds?: string[];
		ops: ApplyBillingPlanRequest["command"]["ops"];
	}): ApplyBillingPlanRequest;
	/** A plan updating only the customer row: its name. */
	renameRequest(params: {
		commandId: string;
		name: string;
	}): ApplyBillingPlanRequest;
	readCustomerProduct(): Promise<Record<string, unknown> | null>;
	readProcessor(): Promise<unknown>;
	readName(): Promise<unknown>;
	readCurrency(): Promise<unknown>;
	readEntity(entityId: string): Promise<Record<string, unknown> | null>;
	/** Another writer deleting the product (its grants cascade) behind the worker. */
	deleteCustomerProductBehindWorker(): Promise<void>;
	/** Another writer changing the product's subscriptions behind the worker. */
	writeSubscriptionIdsBehindWorker(ids: string[]): Promise<void>;
	countCustomers(): Promise<number>;
	readBalance(): Promise<number>;
	cleanup(): Promise<void>;
};

/** A customer the seeded org does not have yet, and the plan that creates it on the seeded product and grant. */
export async function planNewCustomer({
	postgres,
	seeded,
	balance = 100,
}: {
	postgres: PostgresClient;
	seeded: SeededCustomer;
	balance?: number;
}): Promise<PlannedCustomer> {
	const suffix = crypto.randomUUID().slice(0, 8);
	const now = Date.now();
	const { db } = postgres;
	const { orgId, env } = seeded;
	const customerId = `cus_plan_${suffix}`;
	const internalCustomerId = `cus_int_plan_${suffix}`;
	const customerProductId = `cp_plan_${suffix}`;
	const customerEntitlementId = `ce_plan_${suffix}`;
	const identity = { orgId, env, customerId, entityId: null };

	const catalog = await getCatalogRows({
		ctx: { db, orgId, env },
		ids: {
			entitlementIds: [seeded.entitlementId],
			productInternalIds: [seeded.internalProductId],
			featureInternalIds: [seeded.internalFeatureId],
			priceIds: [],
		},
	});
	const catalogRows: CatalogRow[] = [
		...catalog.entitlements.map((row) => ({
			table: "entitlements" as const,
			row,
		})),
		...catalog.products.map((row) => ({ table: "products" as const, row })),
		...catalog.features.map((row) => ({ table: "features" as const, row })),
	];

	function request({
		commandId,
		customerProductId: productRowId = customerProductId,
	}: {
		commandId: string;
		customerProductId?: string;
	}): ApplyBillingPlanRequest {
		return {
			command: {
				schemaVersion: 1,
				type: "applyBillingPlan",
				commandId,
				entityIds: [],
				requestId: `req_${commandId}`,
				identity,
				occurredAt: now,
				ops: [
					{
						op: "insert",
						table: "customer",
						row: {
							internal_id: internalCustomerId,
							id: customerId,
							org_id: orgId,
							env: AppEnv.Sandbox,
							created_at: now,
							name: "Ada",
							email: null,
							fingerprint: null,
							metadata: { plan: "team" },
							processor: null,
							processors: {},
							send_email_receipts: false,
							currency: null,
							config: null,
							auto_topups: null,
							spend_limits: null,
							overage_allowed: null,
							usage_limits: null,
							usage_alerts: null,
						},
					},
					{
						op: "insert",
						table: "customerProducts",
						row: {
							id: productRowId,
							internal_product_id: seeded.internalProductId,
							product_id: "pro",
							internal_customer_id: internalCustomerId,
							customer_id: customerId,
							internal_entity_id: null,
							entity_id: null,
							created_at: now,
							updated_at: null,
							status: CusProductStatus.Active,
							canceled: false,
							starts_at: now,
							access_starts_at: null,
							trial_ends_at: null,
							billing_cycle_anchor: null,
							billing_cycle_anchor_resets_at: null,
							canceled_at: null,
							ended_at: null,
							options: [{ feature_id: seeded.featureId, quantity: 3 }],
							free_trial_id: null,
							collection_method: CollectionMethod.ChargeAutomatically,
							subscription_ids: [`sub_stripe_${suffix}`],
							scheduled_ids: [],
							processor: null,
							quantity: 1,
							api_semver: null,
							is_custom: false,
							customer_license_link_id: null,
							released_at: null,
							billing_version: BillingVersion.V2,
							external_id: null,
						},
					},
					{
						op: "insert",
						table: "customerEntitlements",
						row: {
							id: customerEntitlementId,
							customer_product_id: productRowId,
							entitlement_id: seeded.entitlementId,
							internal_customer_id: internalCustomerId,
							internal_entity_id: null,
							internal_feature_id: seeded.internalFeatureId,
							customer_id: customerId,
							feature_id: seeded.featureId,
							balance,
							adjustment: 0,
							additional_balance: 0,
							unlimited: false,
							usage_allowed: false,
							separate_interval: false,
							next_reset_at: null,
							reset_cycle_anchor: null,
							expires_at: null,
							external_id: null,
							created_at: now,
							entities: null,
						},
					},
				],
			},
			catalogRows,
		};
	}

	function linkBackRequest({
		commandId,
		customerProductId: productRowId = customerProductId,
	}: {
		commandId: string;
		customerProductId?: string;
	}): ApplyBillingPlanRequest {
		return {
			command: {
				schemaVersion: 1,
				type: "applyBillingPlan",
				commandId,
				entityIds: [],
				requestId: `req_${commandId}`,
				identity,
				occurredAt: now,
				ops: [
					{
						op: "update",
						table: "customer",
						id: internalCustomerId,
						set: {
							processor: { id: `cus_stripe_${suffix}`, type: "stripe" },
						},
					},
					{
						op: "update",
						table: "customerProducts",
						id: productRowId,
						set: {
							subscription_ids: [`sub_linked_${suffix}`],
							scheduled_ids: [`sched_linked_${suffix}`],
						},
					},
				],
			},
			catalogRows,
		};
	}

	function opsRequest({
		commandId,
		entityIds = [],
		ops,
	}: {
		commandId: string;
		entityIds?: string[];
		ops: ApplyBillingPlanRequest["command"]["ops"];
	}): ApplyBillingPlanRequest {
		return {
			command: {
				schemaVersion: 1,
				type: "applyBillingPlan",
				commandId,
				requestId: `req_${commandId}`,
				identity,
				occurredAt: now,
				entityIds,
				ops,
			},
			catalogRows,
		};
	}

	function renameRequest({
		commandId,
		name,
	}: {
		commandId: string;
		name: string;
	}): ApplyBillingPlanRequest {
		return {
			command: {
				schemaVersion: 1,
				type: "applyBillingPlan",
				commandId,
				entityIds: [],
				requestId: `req_${commandId}`,
				identity,
				occurredAt: now,
				ops: [
					{
						op: "update",
						table: "customer",
						id: internalCustomerId,
						set: { name },
					},
				],
			},
			catalogRows,
		};
	}

	async function readCurrency(): Promise<unknown> {
		const rows = await db.execute(
			sql`SELECT currency FROM customers WHERE internal_id = ${internalCustomerId}`,
		);
		return rows[0]?.currency;
	}

	async function readEntity(
		entityId: string,
	): Promise<Record<string, unknown> | null> {
		const rows = await db.execute(
			sql`SELECT id, name, feature_id FROM entities WHERE internal_customer_id = ${internalCustomerId} AND id = ${entityId}`,
		);
		return rows[0] ?? null;
	}

	async function readName(): Promise<unknown> {
		const rows = await db.execute(
			sql`SELECT name FROM customers WHERE internal_id = ${internalCustomerId}`,
		);
		return rows[0]?.name;
	}

	async function deleteCustomerProductBehindWorker(): Promise<void> {
		await db.execute(
			sql`DELETE FROM customer_products WHERE id = ${customerProductId}`,
		);
	}

	async function readProcessor(): Promise<unknown> {
		const rows = await db.execute(
			sql`SELECT processor FROM customers WHERE internal_id = ${internalCustomerId}`,
		);
		return rows[0]?.processor;
	}

	async function writeSubscriptionIdsBehindWorker(
		ids: string[],
	): Promise<void> {
		await db.execute(
			sql`UPDATE customer_products SET subscription_ids = ARRAY[${sql.join(
				ids.map((id) => sql`${id}`),
				sql`, `,
			)}]::text[] WHERE id = ${customerProductId}`,
		);
	}

	async function readCustomerProduct(): Promise<Record<
		string,
		unknown
	> | null> {
		const rows = await db.execute(
			sql`SELECT options, subscription_ids, scheduled_ids FROM customer_products WHERE id = ${customerProductId}`,
		);
		return rows[0] ?? null;
	}

	async function countCustomers(): Promise<number> {
		const rows = await db.execute(
			sql`SELECT count(*)::int AS count FROM customers WHERE org_id = ${orgId} AND env = ${env} AND id = ${customerId}`,
		);
		return Number(rows[0]?.count);
	}

	async function readBalance(): Promise<number> {
		const rows = await db.execute(
			sql`SELECT balance FROM customer_entitlements WHERE id = ${customerEntitlementId}`,
		);
		return Number(rows[0]?.balance);
	}

	async function cleanup(): Promise<void> {
		await db.execute(
			sql`DELETE FROM customer_entitlements WHERE internal_customer_id = ${internalCustomerId}`,
		);
		await db.execute(
			sql`DELETE FROM customer_products WHERE internal_customer_id = ${internalCustomerId}`,
		);
		await db.execute(
			sql`DELETE FROM entities WHERE internal_customer_id = ${internalCustomerId}`,
		);
		await db.execute(
			sql`DELETE FROM customers WHERE internal_id = ${internalCustomerId}`,
		);
	}

	return {
		identity,
		internalCustomerId,
		customerProductId,
		customerEntitlementId,
		request,
		linkBackRequest,
		opsRequest,
		renameRequest,
		readCustomerProduct,
		readProcessor,
		readName,
		readCurrency,
		readEntity,
		deleteCustomerProductBehindWorker,
		writeSubscriptionIdsBehindWorker,
		countCustomers,
		readBalance,
		cleanup,
	};
}

export type PlannedEntity = {
	identity: MeteringIdentity;
	customerProductId: string;
	customerEntitlementId: string;
	/** One plan over two owners: the customer's name, and a product with its grant on the entity. */
	request(params: {
		commandId: string;
		customerProductId?: string;
		entityId?: string;
	}): ApplyBillingPlanRequest;
	readEntityGrantBalance(): Promise<number | null>;
	cleanup(): Promise<void>;
};

/** An entity of a planned customer the plan already created, seeded in Postgres, and a plan that touches it and the customer. */
export async function planEntityOfCustomer({
	postgres,
	seeded,
	planned,
}: {
	postgres: PostgresClient;
	seeded: SeededCustomer;
	planned: PlannedCustomer;
}): Promise<PlannedEntity> {
	const suffix = crypto.randomUUID().slice(0, 8);
	const { db } = postgres;
	const entityId = `ent_plan_${suffix}`;
	const internalEntityId = `ent_int_plan_${suffix}`;
	const customerProductId = `cp_ent_plan_${suffix}`;
	const customerEntitlementId = `ce_ent_plan_${suffix}`;
	await db.insert(schemas.entities).values({
		id: entityId,
		internal_id: internalEntityId,
		internal_customer_id: planned.internalCustomerId,
		org_id: seeded.orgId,
		env: seeded.env,
		created_at: Date.now(),
		name: "Seat",
		feature_id: seeded.featureId,
		internal_feature_id: seeded.internalFeatureId,
	});

	// The created customer's own rows, moved onto the entity.
	const createdOps = planned.request({ commandId: "entity_template" }).command
		.ops;
	const [productRow] = createdOps.flatMap((op) =>
		op.op === "insert" && op.table === "customerProducts" ? [op.row] : [],
	);
	const [grantRow] = createdOps.flatMap((op) =>
		op.op === "insert" && op.table === "customerEntitlements" ? [op.row] : [],
	);
	if (!productRow || !grantRow)
		throw new Error("The created plan has no product or grant row");

	function request({
		commandId,
		customerProductId: productRowId = customerProductId,
		entityId: namedEntityId = entityId,
	}: {
		commandId: string;
		customerProductId?: string;
		entityId?: string;
	}): ApplyBillingPlanRequest {
		const { command, catalogRows } = planned.request({ commandId });
		return {
			command: {
				...command,
				entityIds: [namedEntityId],
				ops: [
					{
						op: "update",
						table: "customer",
						id: planned.internalCustomerId,
						set: { name: "Grace" },
					},
					{
						op: "insert",
						table: "customerProducts",
						row: {
							...productRow,
							id: productRowId,
							internal_entity_id: internalEntityId,
							entity_id: entityId,
						},
					},
					{
						op: "insert",
						table: "customerEntitlements",
						row: {
							...grantRow,
							id: customerEntitlementId,
							customer_product_id: productRowId,
							internal_entity_id: internalEntityId,
							balance: 20,
						},
					},
				],
			},
			catalogRows,
		};
	}

	async function readEntityGrantBalance(): Promise<number | null> {
		const rows = await db.execute(
			sql`SELECT balance FROM customer_entitlements WHERE id = ${customerEntitlementId}`,
		);
		return rows[0] ? Number(rows[0].balance) : null;
	}

	async function cleanup(): Promise<void> {
		await db.execute(
			sql`DELETE FROM customer_products WHERE id = ${customerProductId}`,
		);
		await db.execute(
			sql`DELETE FROM entities WHERE internal_id = ${internalEntityId}`,
		);
	}

	return {
		identity: { ...planned.identity, entityId },
		customerProductId,
		customerEntitlementId,
		request,
		readEntityGrantBalance,
		cleanup,
	};
}
