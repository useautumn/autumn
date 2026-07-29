/** Benchmarks the batch-transition core against an isolated dev-DB schema.
 * Run under `NODE_ENV=development infisical run --env=dev --recursive -- bun`. */

import { mock } from "bun:test";
import {
	AllowanceType,
	AppEnv,
	type CustomerLicenseTransition,
	EntInterval,
	type EntitlementWithFeature,
	FeatureType,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { assertNotProductionDb } from "@/db/dbUtils";
import { computeBatchTransitionOperations } from "@/internal/billing/v2/actions/batchTransition/compute/operations/computeBatchTransitionOperations";
import { computeProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions";
import { executeCustomerEntitlementOperations } from "@/internal/billing/v2/actions/batchTransition/execute/executeCustomerEntitlementOperations";
import { executeCustomerProductTransition } from "@/internal/billing/v2/actions/batchTransition/execute/executeCustomerProductTransition";
import { listDistinctEntitlementsByCustomerLicense } from "@/internal/products/entitlements/repos/listDistinctEntitlementsByCustomerLicense";

if (process.env.NODE_ENV !== "development") {
	throw new Error("Run this benchmark with NODE_ENV=development");
}
if (
	process.env.INFISICAL_ENVIRONMENT &&
	process.env.INFISICAL_ENVIRONMENT !== "dev"
) {
	throw new Error("Run this benchmark with the Infisical dev environment");
}
if (process.env.ENV_FILE && process.env.ENV_FILE !== ".env") {
	throw new Error("Run this benchmark with the dev ENV_FILE");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
assertNotProductionDb(process.env.DATABASE_URL);

const benchmarkDatabaseUrl = new URL(process.env.DATABASE_URL);
benchmarkDatabaseUrl.hostname = benchmarkDatabaseUrl.hostname.replace(
	"-pooler.",
	".",
);

const BENCHMARK_SCHEMA = `batch_transition_bench_${process.pid}_${Date.now()}`;
if (!/^batch_transition_bench_\d+_\d+$/.test(BENCHMARK_SCHEMA)) {
	throw new Error("Invalid benchmark schema name");
}
const BENCHMARK_POOL_CONNECTIONS = Number(
	process.env.BENCHMARK_POOL_CONNECTIONS ?? 4,
);
if (
	!Number.isInteger(BENCHMARK_POOL_CONNECTIONS) ||
	BENCHMARK_POOL_CONNECTIONS < 1 ||
	BENCHMARK_POOL_CONNECTIONS > 8
) {
	throw new Error("BENCHMARK_POOL_CONNECTIONS must be between 1 and 8");
}

const { initDrizzle } = await import("@/db/initDrizzle");
const { db: bootstrapDb, client: bootstrapClient } = initDrizzle({
	databaseUrl: benchmarkDatabaseUrl.toString(),
	maxConnections: 1,
	poolConfig: {
		application_name: "batch-transition-dev-benchmark-bootstrap",
		query_timeout: 0,
	},
});
await bootstrapDb.execute(
	sql`CREATE SCHEMA ${sql.identifier(BENCHMARK_SCHEMA)}`,
);

const { db, client } = initDrizzle({
	databaseUrl: benchmarkDatabaseUrl.toString(),
	maxConnections: BENCHMARK_POOL_CONNECTIONS,
	poolConfig: {
		application_name: "batch-transition-dev-benchmark",
		options: `-c search_path=${BENCHMARK_SCHEMA},public -c statement_timeout=0`,
		query_timeout: 0,
	},
});

const ENTITY_COUNTS = (process.env.BENCHMARK_ENTITY_COUNTS ?? "100000")
	.split(",")
	.map(Number)
	.filter((count) => Number.isInteger(count) && count > 0);
const ASSIGNMENTS_PER_ENTITY = 2;
const BENCHMARK_MODE = process.env.BENCHMARK_MODE ?? "end-to-end";
const BENCHMARK_INDEXES = process.env.BENCHMARK_INDEXES === "true";
const BENCHMARK_PARALLEL_LINKS =
	process.env.BENCHMARK_PARALLEL_LINKS === "true";
const POOL_LINK_IDS = Array.from(
	{ length: ASSIGNMENTS_PER_ENTITY },
	(_, index) => `batch_transition_bench_link_${index + 1}`,
);
const INTERNAL_CUSTOMER_ID = "batch_transition_bench_customer";
const CUSTOMER_ID = "batch-transition-bench-customer";
const PARENT_CUSTOMER_PRODUCT_ID = "batch_transition_bench_parent";
const FROM_INTERNAL_PRODUCT_ID = "batch_transition_bench_product_from";
const TO_INTERNAL_PRODUCT_ID = "batch_transition_bench_product_to";
const NOW = Date.now();

const messageFeature = {
	internal_id: "batch_transition_bench_feature_messages",
	org_id: "batch_transition_bench_org",
	created_at: NOW,
	env: AppEnv.Sandbox,
	id: "messages",
	name: "Messages",
	type: FeatureType.Metered,
	config: null,
	display: null,
	archived: false,
	event_names: [],
	model_markups: null,
	stripe_meter: null,
};
const wordFeature = {
	...messageFeature,
	internal_id: "batch_transition_bench_feature_words",
	id: "words",
	name: "Words",
};
const adminFeature = {
	...messageFeature,
	internal_id: "batch_transition_bench_feature_admin",
	id: "admin",
	name: "Admin",
	type: FeatureType.Boolean,
};

const entitlement = ({
	id,
	internalProductId,
	feature,
	allowance,
}: {
	id: string;
	internalProductId: string;
	feature: typeof messageFeature;
	allowance?: number;
}): EntitlementWithFeature => ({
	id,
	created_at: NOW,
	internal_feature_id: feature.internal_id,
	internal_product_id: internalProductId,
	internal_reward_id: null,
	is_custom: false,
	allowance_type:
		feature.type === FeatureType.Boolean
			? AllowanceType.None
			: AllowanceType.Fixed,
	allowance: allowance ?? null,
	interval: feature.type === FeatureType.Boolean ? null : EntInterval.Month,
	interval_count: 1,
	carry_from_previous: false,
	entity_feature_id: null,
	usage_limit: null,
	feature,
});

const fromMessageEntitlement = entitlement({
	id: "batch_transition_bench_ent_messages_from",
	internalProductId: FROM_INTERNAL_PRODUCT_ID,
	feature: messageFeature,
	allowance: 100,
});
const toMessageEntitlement = entitlement({
	id: "batch_transition_bench_ent_messages_to",
	internalProductId: TO_INTERNAL_PRODUCT_ID,
	feature: messageFeature,
	allowance: 500,
});
const fromAdminEntitlement = entitlement({
	id: "batch_transition_bench_ent_admin_from",
	internalProductId: FROM_INTERNAL_PRODUCT_ID,
	feature: adminFeature,
});
const toWordEntitlement = entitlement({
	id: "batch_transition_bench_ent_words_to",
	internalProductId: TO_INTERNAL_PRODUCT_ID,
	feature: wordFeature,
	allowance: 200,
});

const product = ({
	id,
	internalId,
	entitlements,
}: {
	id: string;
	internalId: string;
	entitlements: EntitlementWithFeature[];
}) =>
	({
		id,
		internal_id: internalId,
		name: id,
		group: "batch-transition-bench-seat",
		entitlements,
		prices: [],
	}) as unknown as FullProduct;

const fromProduct = product({
	id: "batch-transition-seat-from",
	internalId: FROM_INTERNAL_PRODUCT_ID,
	entitlements: [fromMessageEntitlement, fromAdminEntitlement],
});
const toProduct = product({
	id: "batch-transition-seat-to",
	internalId: TO_INTERNAL_PRODUCT_ID,
	entitlements: [toMessageEntitlement, toWordEntitlement],
});

const fullCustomer = {
	id: CUSTOMER_ID,
	internal_id: INTERNAL_CUSTOMER_ID,
	entities: [],
} as unknown as FullCustomer;
const parentCustomerProduct = {
	id: PARENT_CUSTOMER_PRODUCT_ID,
} as FullCusProduct;

const setupModulePath = import.meta.resolve(
	"../../src/internal/billing/v2/actions/batchTransition/setup/setupBatchTransitionContext.ts",
);
mock.module(setupModulePath, () => ({
	setupBatchTransitionContext: async () => ({
		fullCustomer,
		parentCustomerProduct,
		currentEpochMs: NOW,
		resetCycleAnchorMs: NOW,
	}),
}));

const { batchTransition } = await import(
	"@/internal/billing/v2/actions/batchTransition/batchTransition"
);

const createBenchmarkTables = async () => {
	for (const table of [
		"features",
		"entitlements",
		"customer_products",
		"customer_entitlements",
	]) {
		await db.execute(
			sql`CREATE TABLE ${sql.identifier(table)} (LIKE public.${sql.identifier(table)} INCLUDING ALL)`,
		);
	}
};

const createBenchmarkIndexes = async () => {
	await db.execute(sql`
		CREATE INDEX batch_transition_bench_ce_product_entitlement
		ON customer_entitlements (customer_product_id, entitlement_id)
	`);
	await db.execute(sql`
		CREATE INDEX batch_transition_bench_cp_link_id
		ON customer_products (customer_license_link_id, id)
		WHERE internal_entity_id IS NOT NULL
			AND status IN ('active', 'past_due')
	`);
};

const seedDefinitions = async () => {
	await db.execute(sql`
		INSERT INTO features (internal_id, org_id, created_at, env, id, name, type)
		VALUES
			(${messageFeature.internal_id}, ${messageFeature.org_id}, ${NOW}, ${AppEnv.Sandbox}, ${messageFeature.id}, ${messageFeature.name}, ${FeatureType.Metered}),
			(${wordFeature.internal_id}, ${wordFeature.org_id}, ${NOW}, ${AppEnv.Sandbox}, ${wordFeature.id}, ${wordFeature.name}, ${FeatureType.Metered}),
			(${adminFeature.internal_id}, ${adminFeature.org_id}, ${NOW}, ${AppEnv.Sandbox}, ${adminFeature.id}, ${adminFeature.name}, ${FeatureType.Boolean})
	`);
	for (const definition of [
		fromMessageEntitlement,
		toMessageEntitlement,
		fromAdminEntitlement,
		toWordEntitlement,
	]) {
		await db.execute(sql`
			INSERT INTO entitlements (
				id, created_at, internal_feature_id, internal_product_id,
				is_custom, allowance_type, allowance, interval, interval_count,
				carry_from_previous
			)
			VALUES (
				${definition.id}, ${definition.created_at},
				${definition.internal_feature_id}, ${definition.internal_product_id},
				false, ${definition.allowance_type}, ${definition.allowance},
				${definition.interval}, ${definition.interval_count}, false
			)
		`);
	}
};

const timed = async <T>({
	label,
	fn,
}: {
	label: string;
	fn: () => Promise<T>;
}) => {
	const startedAt = performance.now();
	const result = await fn();
	const milliseconds = performance.now() - startedAt;
	console.log(`${label}: ${(milliseconds / 1000).toFixed(2)}s`);
	return { result, milliseconds };
};

const seedAssignments = async ({ entityCount }: { entityCount: number }) => {
	await db.execute(sql`TRUNCATE customer_entitlements, customer_products`);
	await timed({
		label: `seed ${entityCount.toLocaleString()} entities × ${ASSIGNMENTS_PER_ENTITY} assignments`,
		fn: () =>
			db.execute(sql`
				INSERT INTO customer_products (
					id, internal_customer_id, internal_product_id, internal_entity_id,
					created_at, status, customer_license_link_id
				)
				SELECT
					'batch_transition_bench_cp_' || pool || '_' || entity_index,
					${INTERNAL_CUSTOMER_ID},
					${FROM_INTERNAL_PRODUCT_ID},
					'batch_transition_bench_entity_' || entity_index,
					${NOW},
					'active',
					'batch_transition_bench_link_' || pool
				FROM generate_series(1, ${entityCount}) AS entity_index
				CROSS JOIN generate_series(1, ${ASSIGNMENTS_PER_ENTITY}) AS pool
			`),
	});
	await timed({
		label: `seed ${(entityCount * ASSIGNMENTS_PER_ENTITY * 2).toLocaleString()} customer entitlements`,
		fn: () =>
			db.execute(sql`
				INSERT INTO customer_entitlements (
					id, customer_product_id, entitlement_id, internal_customer_id,
					internal_feature_id, feature_id, unlimited, balance, created_at,
					usage_allowed, separate_interval, cache_version
				)
				SELECT
					'batch_transition_bench_ce_' || definition.kind || '_' || pool || '_' || entity_index,
					'batch_transition_bench_cp_' || pool || '_' || entity_index,
					definition.entitlement_id,
					${INTERNAL_CUSTOMER_ID},
					definition.internal_feature_id,
					definition.feature_id,
					definition.unlimited,
					definition.balance,
					${NOW},
					false,
					false,
					0
				FROM generate_series(1, ${entityCount}) AS entity_index
				CROSS JOIN generate_series(1, ${ASSIGNMENTS_PER_ENTITY}) AS pool
				CROSS JOIN (
					VALUES
						('messages', ${fromMessageEntitlement.id}, ${messageFeature.internal_id}, ${messageFeature.id}, false, 80),
						('admin', ${fromAdminEntitlement.id}, ${adminFeature.internal_id}, ${adminFeature.id}, NULL, 0)
				) AS definition(kind, entitlement_id, internal_feature_id, feature_id, unlimited, balance)
			`),
	});
	await db.execute(sql`ANALYZE customer_products, customer_entitlements`);
};

const customerLicenseTransition = ({
	linkId,
	from,
	to,
}: {
	linkId: string;
	from: FullProduct;
	to: FullProduct;
}) =>
	({
		outgoingCustomerLicense: {
			internal_customer_id: INTERNAL_CUSTOMER_ID,
			parent_customer_product_id: PARENT_CUSTOMER_PRODUCT_ID,
			planLicense: { product: from },
		},
		incomingCustomerLicense: {
			internal_customer_id: INTERNAL_CUSTOMER_ID,
			parent_customer_product_id: PARENT_CUSTOMER_PRODUCT_ID,
			planLicense: { product: to },
		},
		updates: { linkId },
	}) as CustomerLicenseTransition;

const runDirection = async ({
	label,
	from,
	to,
}: {
	label: string;
	from: FullProduct;
	to: FullProduct;
}) =>
	timed({
		label,
		fn: async () => {
			const runLink = (linkId: string) =>
				batchTransition({
					ctx: { db, extraLogs: {} } as never,
					transition: customerLicenseTransition({ linkId, from, to }),
					executionScope: {
						batchTransitionId: `batch_transition_bench_${label}_${linkId}`,
						assignmentCutoffMs: NOW,
					},
				});
			if (BENCHMARK_PARALLEL_LINKS) {
				await Promise.all(POOL_LINK_IDS.map(runLink));
				return;
			}
			for (const linkId of POOL_LINK_IDS) {
				await runLink(linkId);
			}
		},
	});

const runDirectionBreakdown = async ({
	from,
	to,
}: {
	from: FullProduct;
	to: FullProduct;
}) => {
	const steps: Array<{
		linkId: string;
		step: string;
		milliseconds: number;
	}> = [];
	const startedAt = performance.now();
	const productTransitions = computeProductTransitions({
		fromProduct: from,
		toProduct: to,
	});
	for (const linkId of POOL_LINK_IDS) {
		const distinct = await timed({
			label: `${linkId} list distinct entitlements`,
			fn: () =>
				listDistinctEntitlementsByCustomerLicense({
					db,
					customerLicenseLinkId: linkId,
					limit: 101,
				}),
		});
		steps.push({
			linkId,
			step: "list distinct",
			milliseconds: distinct.milliseconds,
		});
		const computed = computeBatchTransitionOperations({
			candidateOutgoingEntitlements: distinct.result,
			candidateOutgoingBasePrices: [],
			productTransitions,
			customerEntitlementInitContext: {
				fullCustomer,
				fullProduct: to,
				featureQuantities: [],
				resetCycleAnchor: NOW,
				freeTrial: null,
				now: NOW,
			},
			customerEntitlementInitOptions: { customerLicenseLinkId: linkId },
		});

		for (const operation of computed.operations.entitlementPrices) {
			const operationResult = await timed({
				label: `${linkId} ${operation.type} customer entitlements`,
				fn: () =>
					executeCustomerEntitlementOperations({
						ctx: { db, extraLogs: {} } as never,
						batchTransition: {
							batchTransitionId: `batch_transition_bench_breakdown_${linkId}`,
							assignmentCutoffMs: NOW,
							customerLicenseLinkId: linkId,
							operations: {
								basePrice: undefined,
								customerEntitlementCycles: [],
								entitlementPrices: [operation],
							},
							unhandledTransitions: [],
						},
					}),
			});
			steps.push({
				linkId,
				step: operation.type,
				milliseconds: operationResult.milliseconds,
			});
		}

		if (productTransitions.customerProduct) {
			const repointResult = await timed({
				label: `${linkId} repoint customer products`,
				fn: () =>
					executeCustomerProductTransition({
						ctx: { db, extraLogs: {} } as never,
						customerLicenseLinkId: linkId,
						transition: productTransitions.customerProduct!,
					}),
			});
			steps.push({
				linkId,
				step: "repoint",
				milliseconds: repointResult.milliseconds,
			});
		}
	}
	return { milliseconds: performance.now() - startedAt, steps };
};

const countRows = async ({
	table,
	predicate,
}: {
	table: "customer_products" | "customer_entitlements";
	predicate: ReturnType<typeof sql>;
}) => {
	const [row] = await db.execute<{ count: number }>(sql`
		SELECT count(*)::int AS count
		FROM ${sql.identifier(table)}
		WHERE ${predicate}
	`);
	return row.count;
};

const verifyDirection = async ({
	entityCount,
	internalProductId,
	messageEntitlementId,
	presentEntitlementId,
	absentEntitlementId,
}: {
	entityCount: number;
	internalProductId: string;
	messageEntitlementId: string;
	presentEntitlementId: string;
	absentEntitlementId: string;
}) => {
	const expectedAssignments = entityCount * ASSIGNMENTS_PER_ENTITY;
	const [productsCount, messageCount, presentCount, absentCount] =
		await Promise.all([
			countRows({
				table: "customer_products",
				predicate: sql`internal_product_id = ${internalProductId}`,
			}),
			countRows({
				table: "customer_entitlements",
				predicate: sql`entitlement_id = ${messageEntitlementId}`,
			}),
			countRows({
				table: "customer_entitlements",
				predicate: sql`entitlement_id = ${presentEntitlementId}`,
			}),
			countRows({
				table: "customer_entitlements",
				predicate: sql`entitlement_id = ${absentEntitlementId}`,
			}),
		]);
	if (
		productsCount !== expectedAssignments ||
		messageCount !== expectedAssignments ||
		presentCount !== expectedAssignments ||
		absentCount !== 0
	) {
		throw new Error(
			`Convergence failed: ${JSON.stringify({ productsCount, messageCount, presentCount, absentCount, expectedAssignments })}`,
		);
	}
};

const benchmarkScale = async ({ entityCount }: { entityCount: number }) => {
	console.log(`\n${entityCount.toLocaleString()} entities`);
	await seedAssignments({ entityCount });
	if (BENCHMARK_MODE === "breakdown") {
		const breakdown = await runDirectionBreakdown({
			from: fromProduct,
			to: toProduct,
		});
		await verifyDirection({
			entityCount,
			internalProductId: TO_INTERNAL_PRODUCT_ID,
			messageEntitlementId: toMessageEntitlement.id,
			presentEntitlementId: toWordEntitlement.id,
			absentEntitlementId: fromAdminEntitlement.id,
		});
		console.table(
			breakdown.steps.map((step) => ({
				...step,
				seconds: Number((step.milliseconds / 1000).toFixed(2)),
			})),
		);
		return {
			entities: entityCount,
			assignments: entityCount * ASSIGNMENTS_PER_ENTITY,
			mode: BENCHMARK_MODE,
			indexes: BENCHMARK_INDEXES,
			totalMs: Number(breakdown.milliseconds.toFixed(1)),
		};
	}
	const forward = await runDirection({
		label: "forward replace + add + remove + repoint",
		from: fromProduct,
		to: toProduct,
	});
	await verifyDirection({
		entityCount,
		internalProductId: TO_INTERNAL_PRODUCT_ID,
		messageEntitlementId: toMessageEntitlement.id,
		presentEntitlementId: toWordEntitlement.id,
		absentEntitlementId: fromAdminEntitlement.id,
	});
	const replay = await runDirection({
		label: "idempotent forward replay",
		from: fromProduct,
		to: toProduct,
	});
	await verifyDirection({
		entityCount,
		internalProductId: TO_INTERNAL_PRODUCT_ID,
		messageEntitlementId: toMessageEntitlement.id,
		presentEntitlementId: toWordEntitlement.id,
		absentEntitlementId: fromAdminEntitlement.id,
	});
	const reverse = await runDirection({
		label: "reverse replace + add + remove + repoint",
		from: toProduct,
		to: fromProduct,
	});
	await verifyDirection({
		entityCount,
		internalProductId: FROM_INTERNAL_PRODUCT_ID,
		messageEntitlementId: fromMessageEntitlement.id,
		presentEntitlementId: fromAdminEntitlement.id,
		absentEntitlementId: toWordEntitlement.id,
	});

	const assignments = entityCount * ASSIGNMENTS_PER_ENTITY;
	return {
		entities: entityCount,
		assignments,
		parallelLicensePools: BENCHMARK_PARALLEL_LINKS,
		poolConnections: BENCHMARK_POOL_CONNECTIONS,
		mutationStatementsPerFullDirection:
			POOL_LINK_IDS.length * 4 * Math.ceil(entityCount / 5_000),
		forwardMs: Number(forward.milliseconds.toFixed(1)),
		replayMs: Number(replay.milliseconds.toFixed(1)),
		reverseMs: Number(reverse.milliseconds.toFixed(1)),
		forwardAssignmentsPerSecond: Math.round(
			(assignments * 1000) / forward.milliseconds,
		),
		reverseAssignmentsPerSecond: Math.round(
			(assignments * 1000) / reverse.milliseconds,
		),
	};
};

try {
	console.log(
		`DEV benchmark schema: ${BENCHMARK_SCHEMA}; pool connections: ${BENCHMARK_POOL_CONNECTIONS}`,
	);
	await createBenchmarkTables();
	if (BENCHMARK_INDEXES) await createBenchmarkIndexes();
	await seedDefinitions();
	const results = [];
	for (const entityCount of ENTITY_COUNTS) {
		const result = await benchmarkScale({ entityCount });
		results.push(result);
		console.table([result]);
	}
} finally {
	await client.end();
	await bootstrapDb.execute(
		sql`DROP SCHEMA ${sql.identifier(BENCHMARK_SCHEMA)} CASCADE`,
	);
	await bootstrapClient.end();
}

process.exit(0);
