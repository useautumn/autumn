import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

import {
	AppEnv,
	type NormalizedFullSubject,
	type SubjectBalance,
	type SubjectFlag,
	normalizedToFullSubject,
} from "@autumn/shared";
import Redis from "ioredis";
import {
	CollectionMethod,
	CusProductStatus,
} from "@shared/models/cusProductModels/cusProductEnums.js";
import { FeatureType } from "@shared/models/featureModels/featureEnums.js";
import { EntInterval } from "@shared/models/productModels/intervals/entitlementInterval.js";
import { AllowanceType } from "@shared/models/productModels/entModels/entModels.js";
import { featureBalancesToHashFields } from "@/internal/customers/cache/fullSubject/balances/featureBalancesToHashFields.js";
import { buildFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectBalanceKey.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import {
	cachedFullSubjectToNormalized,
	normalizedToCachedFullSubject,
	type CachedFullSubject,
} from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";

// Run with: bun run experiments/normalizedSubjectCacheExperiment.ts

const NUM_CUSTOMER_PRODUCTS = 1_000;
const METERED_CES_PER_PRODUCT = 3;
const NUM_METERED_FEATURES = 3;
const NUM_BOOLEAN_FEATURES = 5;
const ROLLOVERS_PER_CE = 1;
const NUM_READS = 10;

const FAKE_ORG_ID = "exp-ns-cache-org";
const FAKE_ENV = AppEnv.Live;
const FAKE_CUSTOMER_ID = "exp-ns-cache-cus";

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${++idCounter}`;
const now = Date.now();

const formatBytes = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(2)} KB`;
	return `${(kb / 1024).toFixed(2)} MB`;
};

const summarize = (samples: number[]) => ({
	avgMs: (
		samples.reduce((sum, sample) => sum + sample, 0) / samples.length
	).toFixed(2),
	minMs: Math.min(...samples).toFixed(2),
	maxMs: Math.max(...samples).toFixed(2),
});

type SlowlogRow = {
	phase: string;
	id: number;
	serverMs: string;
	commandName: string;
	target: string;
	label: string;
};

const keyToAlias = ({ key }: { key: string }) => {
	if (key.includes(":full_subject:balances:")) {
		return `balances:${key.split(":balances:")[1] ?? "unknown"}`;
	}

	if (key.includes(":full_subject")) {
		return "full_subject";
	}

	return key.length > 48 ? `${key.slice(0, 48)}...` : key;
};

const getSlowlogRows = async ({
	redisClient,
	phase,
}: {
	redisClient: Redis;
	phase: string;
}): Promise<SlowlogRow[]> => {
	const rows = (await redisClient.call("SLOWLOG", "GET", "100")) as unknown[][];
	return rows
		.map((entry) => {
			const [id, , durationMicros, command] = entry as [
				number,
				number,
				number,
				string[],
			];
			const commandParts = Array.isArray(command) ? command : [String(command)];
			const commandName = String(commandParts[0] ?? "").toUpperCase();
			const target = commandParts[1]
				? keyToAlias({ key: String(commandParts[1]) })
				: "";

			return {
				phase,
				id,
				serverMs: (durationMicros / 1000).toFixed(3),
				commandName,
				target,
				label: `${commandName.toLowerCase()}${target ? ` ${target}` : ""}`,
			};
		})
		.filter(
			(row) =>
				row.commandName !== "SLOWLOG" &&
				row.commandName !== "CONFIG" &&
				row.commandName !== "MULTI" &&
				row.commandName !== "EXEC",
		);
};

const summarizeSlowlogRows = ({
	rows,
}: {
	rows: SlowlogRow[];
}) => ({
	totalServerMs: rows
		.reduce((sum, row) => sum + Number.parseFloat(row.serverMs), 0)
		.toFixed(3),
	totalCalls: rows.length,
});

const groupSlowlogRowsByCommand = ({
	rows,
}: {
	rows: SlowlogRow[];
}) => {
	return Object.entries(
		rows.reduce<Record<string, { calls: number; totalServerMs: number }>>(
			(acc, row) => {
				const key = `${row.phase}:${row.label}`;
				const existing = acc[key] ?? { calls: 0, totalServerMs: 0 };
				acc[key] = {
					calls: existing.calls + 1,
					totalServerMs:
						existing.totalServerMs + Number.parseFloat(row.serverMs),
				};
				return acc;
			},
			{},
		),
	).map(([key, stats]) => {
		const [phase, ...labelParts] = key.split(":");
		const label = labelParts.join(":");
		return {
			phase,
			operation: label,
			calls: stats.calls,
			totalServerMs: stats.totalServerMs.toFixed(3),
			avgServerMsPerCall: (stats.totalServerMs / stats.calls).toFixed(3),
		};
	});
};

const meteredFeatures = Array.from({ length: NUM_METERED_FEATURES }, (_, i) => ({
	featureId: `metered_feat_${i}`,
	internalFeatureId: `int_feat_metered_${i}`,
	entitlementId: `ent_metered_${i}`,
}));

const booleanFeatures = Array.from({ length: NUM_BOOLEAN_FEATURES }, (_, i) => ({
	featureId: `boolean_feat_${i}`,
	internalFeatureId: `int_feat_boolean_${i}`,
	entitlementId: `ent_boolean_${i}`,
}));

const generateNormalized = (): NormalizedFullSubject => {
	const internalCustomerId = nextId("int_cus");

	const customerProducts = Array.from({ length: NUM_CUSTOMER_PRODUCTS }, (_, i) => ({
		id: nextId("cus_prod"),
		internal_product_id: `int_prod_${i % 10}`,
		product_id: `product_${i % 10}`,
		internal_customer_id: internalCustomerId,
		customer_id: FAKE_CUSTOMER_ID,
		internal_entity_id: null,
		entity_id: null,
		created_at: now - 86400000 * i,
		status: CusProductStatus.Active as string,
		processor: null as unknown,
		canceled: false,
		canceled_at: null,
		ended_at: null,
		starts_at: now - 86400000 * i,
		options: [],
		free_trial_id: null,
		trial_ends_at: null,
		collection_method: CollectionMethod.ChargeAutomatically as string,
		subscription_ids: [`sub_${i}`],
		scheduled_ids: [],
		quantity: 1,
		version: 0,
		usage_limit: null,
		metadata: {},
		billing_version: "v2",
		api_version: null,
		api_semver: "2.2",
		external_id: null,
	}));

	const customerEntitlements = [] as SubjectBalance[];

	for (const customerProduct of customerProducts) {
		for (let i = 0; i < METERED_CES_PER_PRODUCT; i++) {
			const feature = meteredFeatures[i % NUM_METERED_FEATURES];
			const customerEntitlementId = nextId("cus_ent");

			customerEntitlements.push({
				id: customerEntitlementId,
				internal_customer_id: internalCustomerId,
				internal_entity_id: null,
				internal_feature_id: feature.internalFeatureId,
				customer_id: FAKE_CUSTOMER_ID,
				feature_id: feature.featureId,
				customer_product_id: customerProduct.id,
				entitlement_id: feature.entitlementId,
				created_at: now - 86400000,
				unlimited: false,
				balance: 1000 - i,
				additional_balance: 0,
				usage_allowed: true,
				next_reset_at: now + 86400000 * 30,
				adjustment: 50,
				expires_at: null,
				cache_version: 0,
				entities: null,
				external_id: null,
				entitlement: {
					id: feature.entitlementId,
					created_at: now,
					internal_feature_id: feature.internalFeatureId,
					internal_product_id: "int_prod_0",
					is_custom: false,
					allowance_type: AllowanceType.Fixed,
					allowance: 1000,
					interval: EntInterval.Month,
					interval_count: 1,
					carry_from_previous: false,
					entity_feature_id: null,
					org_id: FAKE_ORG_ID,
					feature_id: feature.featureId,
					usage_limit: null,
					rollover: null,
					feature: {
						internal_id: feature.internalFeatureId,
						org_id: FAKE_ORG_ID,
						created_at: now,
						env: FAKE_ENV,
						id: feature.featureId,
						name: `Feature ${feature.featureId}`,
						type: FeatureType.Metered,
						config: null,
						display: null,
						archived: false,
						event_names: [],
					},
				},
				rollovers: [] as any,
				replaceables: [] as any,
				customerPrice: null as any,
				customerProductOptions: [] as any,
				customerProductQuantity: customerProduct.quantity,
				isEntityLevel: false,
			} as SubjectBalance);
		}
	}

	const flags = Object.fromEntries(
		booleanFeatures.map((feature, i) => [
			feature.featureId,
			{
				id: nextId("flag"),
				featureId: feature.featureId,
				internalFeatureId: feature.internalFeatureId,
				entitlementId: feature.entitlementId,
				customerEntitlementId: null,
				customerId: FAKE_CUSTOMER_ID,
				customerProductId: customerProducts[i % customerProducts.length]!.id,
				internalCustomerId: internalCustomerId,
				internalEntityId: null,
				createdAt: now,
				expiresAt: null,
			} as unknown as SubjectFlag,
		]),
	) as Record<string, SubjectFlag>;

	return {
		subjectType: "customer",
		customerId: FAKE_CUSTOMER_ID,
		internalCustomerId: internalCustomerId,
		customer: {
			id: FAKE_CUSTOMER_ID,
			internal_id: internalCustomerId,
			org_id: FAKE_ORG_ID,
			env: FAKE_ENV,
			created_at: now,
			name: "Big Subject Customer",
			email: "bench@example.com",
			fingerprint: null,
			processor: null,
			processors: {},
			metadata: {},
			send_email_receipts: true,
			auto_topups: null,
			spend_limits: null,
			usage_alerts: null,
			overage_allowed: null,
		},
		entity: undefined,
		entityId: undefined,
		internalEntityId: undefined,
		customer_products: customerProducts as any,
		customer_entitlements: customerEntitlements,
		customer_prices: [],
		flags,
		products: Array.from({ length: 10 }, (_, i) => ({
			id: `product_${i}`,
			internal_id: `int_prod_${i}`,
			org_id: FAKE_ORG_ID,
			env: FAKE_ENV,
			name: `Product ${i}`,
			created_at: now,
			is_default: false,
			group: null,
			version: 1,
			singular: false,
			is_add_on: false,
			items: [],
			processor: null,
			default_free_trial: null,
			archived: false,
		})) as any,
		entitlements: [],
		prices: [],
		free_trials: [],
		subscriptions: customerProducts.map((customerProduct, i) => ({
			id: `sub_${i}`,
			customer_id: FAKE_CUSTOMER_ID,
			processor: "stripe",
			processor_id: `sub_${i}`,
			status: "active",
			current_period_start: now,
			current_period_end: now + 86400000 * 30,
			cancel_at_period_end: false,
			canceled_at: null,
			created_at: now,
			updated_at: now,
			product_ids: [customerProduct.product_id],
		})) as any,
		invoices: [
			{
				id: nextId("inv"),
				stripe_id: "in_stripe_1",
				status: "paid",
				total: 1000,
				subtotal: 1000,
				currency: "usd",
				customer_id: FAKE_CUSTOMER_ID,
				internal_entity_id: null,
				product_ids: ["product_0"],
				internal_product_ids: ["int_prod_0"],
				created_at: now,
			},
		] as any,
		entity_aggregations: undefined,
	} as unknown as NormalizedFullSubject;
};

const getBalancePayloads = ({
	normalized,
}: {
	normalized: NormalizedFullSubject;
}) => {
	const byFeature = new Map<string, SubjectBalance[]>();
	for (const customerEntitlement of normalized.customer_entitlements) {
		const existing = byFeature.get(customerEntitlement.feature_id) ?? [];
		existing.push(customerEntitlement);
		byFeature.set(customerEntitlement.feature_id, existing);
	}

	return Array.from(byFeature.entries()).map(([featureId, balances]) => ({
		featureId,
		fields: featureBalancesToHashFields({ featureId, balances }),
	}));
};

const main = async () => {
	const redisClient = new Redis(process.env.CACHE_URL!);
	let originalSlowlogThreshold = "10000";

	try {
		const slowlogConfig = (await redisClient.call(
			"CONFIG",
			"GET",
			"slowlog-log-slower-than",
		)) as string[];
		originalSlowlogThreshold = slowlogConfig?.[1] ?? originalSlowlogThreshold;
		await redisClient.call("CONFIG", "SET", "slowlog-log-slower-than", "0");

		const normalized = generateNormalized();
		const cached = normalizedToCachedFullSubject({
			normalized,
			subjectViewEpoch: 0,
		});
		const subjectKey = buildFullSubjectKey({
			orgId: FAKE_ORG_ID,
			env: FAKE_ENV,
			customerId: FAKE_CUSTOMER_ID,
		});
		const balancePayloads = getBalancePayloads({ normalized });

		const domainSizes = [
			{
				domain: "full_subject",
				size: formatBytes(Buffer.byteLength(JSON.stringify(cached), "utf8")),
			},
			...balancePayloads.map(({ featureId, fields }) => ({
				domain: `balances:${featureId}`,
				size: formatBytes(Buffer.byteLength(JSON.stringify(fields), "utf8")),
			})),
		];

		const publishTimes: number[] = [];
		const subjectReadTimes: number[] = [];
		const balanceReadTimes: number[] = [];
		const hydrateTimes: number[] = [];

		const publishCache = async () => {
			const multi = redisClient.multi();
			for (const { featureId, fields } of balancePayloads) {
				const balanceKey = buildFullSubjectBalanceKey({
					orgId: FAKE_ORG_ID,
					env: FAKE_ENV,
					customerId: FAKE_CUSTOMER_ID,
					featureId,
				});
				multi.del(balanceKey);
				multi.hset(balanceKey, fields);
				multi.expire(balanceKey, FULL_SUBJECT_CACHE_TTL_SECONDS);
			}
			multi.set(
				subjectKey,
				JSON.stringify(cached),
				"EX",
				FULL_SUBJECT_CACHE_TTL_SECONDS,
			);
			await multi.exec();
		};

		const readSubjectKey = async () => await redisClient.get(subjectKey);

		const readBalanceHashes = async ({
			meteredFeatures,
		}: {
			meteredFeatures: string[];
		}) => {
			const pipeline = redisClient.pipeline();
			for (const featureId of meteredFeatures) {
				pipeline.hgetall(
					buildFullSubjectBalanceKey({
						orgId: FAKE_ORG_ID,
						env: FAKE_ENV,
						customerId: FAKE_CUSTOMER_ID,
						featureId,
					}),
				);
			}
			return (await pipeline.exec()) ?? [];
		};

		await redisClient.del(subjectKey);
		for (const { featureId } of balancePayloads) {
			await redisClient.del(
				buildFullSubjectBalanceKey({
					orgId: FAKE_ORG_ID,
					env: FAKE_ENV,
					customerId: FAKE_CUSTOMER_ID,
					featureId,
				}),
			);
		}

		for (let i = 0; i < NUM_READS; i++) {
			const publishStart = performance.now();
			await publishCache();
			publishTimes.push(performance.now() - publishStart);

			const subjectStart = performance.now();
			const subjectRaw = await readSubjectKey();
			subjectReadTimes.push(performance.now() - subjectStart);

			const parsedCached = JSON.parse(subjectRaw!) as CachedFullSubject;

			const balanceStart = performance.now();
			const balanceResults = await readBalanceHashes({
				meteredFeatures: parsedCached.meteredFeatures,
			});
			balanceReadTimes.push(performance.now() - balanceStart);

			const customerEntitlements = balanceResults.flatMap((entry) => {
				const fields = (entry?.[1] ?? {}) as Record<string, string>;
				if (!fields._meta) return [];
				const meta = JSON.parse(fields._meta) as {
					customerEntitlementIds: string[];
				};

				return meta.customerEntitlementIds
					.map((customerEntitlementId) => fields[customerEntitlementId])
					.filter(Boolean)
					.map(
						(balance) => JSON.parse(balance as string) as SubjectBalance,
					);
			});

			const hydrateStart = performance.now();
			const reconstructed = cachedFullSubjectToNormalized({
				cached: parsedCached,
				customerEntitlements,
			});
			normalizedToFullSubject({ normalized: reconstructed });
			hydrateTimes.push(performance.now() - hydrateStart);
		}

		await redisClient.call("SLOWLOG", "RESET");
		await publishCache();
		const publishSlowlogRows = await getSlowlogRows({
			redisClient,
			phase: "publish_full_subject",
		});

		await redisClient.call("SLOWLOG", "RESET");
		await readSubjectKey();
		const subjectReadSlowlogRows = await getSlowlogRows({
			redisClient,
			phase: "read_subject_key",
		});

		await redisClient.call("SLOWLOG", "RESET");
		await readBalanceHashes({
			meteredFeatures: cached.meteredFeatures,
		});
		const balanceReadSlowlogRows = await getSlowlogRows({
			redisClient,
			phase: "read_balance_hashes",
		});

		const readServerSideMs = (
			Number.parseFloat(
				summarizeSlowlogRows({ rows: subjectReadSlowlogRows }).totalServerMs,
			) +
			Number.parseFloat(
				summarizeSlowlogRows({ rows: balanceReadSlowlogRows }).totalServerMs,
			)
		).toFixed(3);

		const allSlowlogRows = [
			...publishSlowlogRows,
			...subjectReadSlowlogRows,
			...balanceReadSlowlogRows,
		];

		console.log("\nSerialized Domain Sizes");
		console.table(domainSizes);

		console.log("\nLatency Summary");
		console.table([
			{
				operation: "publish_full_subject",
				scope: "client_rtt",
				...summarize(publishTimes),
			},
			{
				operation: "read_subject_key",
				scope: "client_rtt",
				...summarize(subjectReadTimes),
			},
			{
				operation: "read_balance_hashes",
				scope: "client_rtt",
				...summarize(balanceReadTimes),
			},
			{
				operation: "hydrate_full_subject_local",
				scope: "local_cpu",
				...summarize(hydrateTimes),
			},
			{
				operation: "full_subject_read_end_to_end",
				scope: "client_rtt_plus_local_cpu",
				...summarize(
					subjectReadTimes.map(
						(subjectMs, index) =>
							subjectMs + balanceReadTimes[index]! + hydrateTimes[index]!,
					),
				),
			},
		]);

		console.log("\nRedis Server Time By Phase");
		console.table([
			{
				phase: "publish_full_subject",
				scope: "redis_server_slowlog",
				...summarizeSlowlogRows({ rows: publishSlowlogRows }),
			},
			{
				phase: "read_subject_key",
				scope: "redis_server_slowlog",
				...summarizeSlowlogRows({ rows: subjectReadSlowlogRows }),
			},
			{
				phase: "read_balance_hashes",
				scope: "redis_server_slowlog",
				...summarizeSlowlogRows({ rows: balanceReadSlowlogRows }),
			},
			{
				phase: "read_full_subject_total",
				scope: "redis_server_slowlog",
				totalServerMs: readServerSideMs,
				totalCalls:
					summarizeSlowlogRows({ rows: subjectReadSlowlogRows }).totalCalls +
					summarizeSlowlogRows({ rows: balanceReadSlowlogRows }).totalCalls,
			},
		]);

		console.log("\nRedis Server Time By Command");
		console.table(groupSlowlogRowsByCommand({ rows: allSlowlogRows }));

		console.log(
			"\nRedis SLOWLOG Command Samples (threshold forced to 0 during measurement)",
		);
		if (allSlowlogRows.length > 0) {
			console.table(
				allSlowlogRows.map((row) => ({
					phase: row.phase,
					serverMs: row.serverMs,
					operation: row.label,
				})),
			);
		} else {
			console.log("No slowlog entries captured for the measured phases.");
		}

		console.log("\nRead Path Summary");
		console.table([
			{
				metric: "redis_server_read_only",
				scope: "redis_server_slowlog",
				avgMs: readServerSideMs,
			},
			{
				metric: "client_rtt_read_only",
				scope: "client_rtt",
				avgMs: (
					Number.parseFloat(summarize(subjectReadTimes).avgMs) +
					Number.parseFloat(summarize(balanceReadTimes).avgMs)
				).toFixed(2),
			},
			{
				metric: "hydrate_full_subject_local",
				scope: "local_cpu",
				avgMs: summarize(hydrateTimes).avgMs,
			},
			{
				metric: "full_subject_read_end_to_end",
				scope: "client_rtt_plus_local_cpu",
				avgMs: (
					Number.parseFloat(summarize(subjectReadTimes).avgMs) +
					Number.parseFloat(summarize(balanceReadTimes).avgMs) +
					Number.parseFloat(summarize(hydrateTimes).avgMs)
				).toFixed(2),
			},
		]);

		console.log("\nLegend");
		console.log(
			"- client_rtt: wall-clock time observed by the Bun process around awaited Redis calls",
		);
		console.log(
			"- redis_server_slowlog: Redis command execution time measured from SLOWLOG entries",
		);
		console.log(
			"- local_cpu: in-process decode + normalizedToFullSubject() time only",
		);
	} finally {
		try {
			await redisClient.call(
				"CONFIG",
				"SET",
				"slowlog-log-slower-than",
				originalSlowlogThreshold,
			);
		} catch {}

		await redisClient.quit();
	}
};

await main();
