/**
 * Benchmark: sanitizeCachedFullSubject + sanitizeCachedSubjectBalance
 *
 * Simulates a customer with 1000 customer products, each with 3 customer
 * entitlements (3000 SubjectBalance blobs total), and measures how long
 * sanitization takes.
 *
 * Run with: bun run experiments/sanitizeBenchmark.ts
 */

import { AppEnv } from "@autumn/shared";
import { CollectionMethod, CusProductStatus } from "@shared/models/cusProductModels/cusProductEnums.js";
import { FeatureType } from "@shared/models/featureModels/featureEnums.js";
import { AllowanceType } from "@shared/models/productModels/entModels/entModels.js";
import { EntInterval } from "@shared/models/productModels/intervals/entitlementInterval.js";
import type { CachedFullSubject } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import { sanitizeCachedFullSubject } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedFullSubject.js";
import { sanitizeCachedSubjectBalance } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedSubjectBalance.js";

const NUM_CUSTOMER_PRODUCTS = 1000;
const CUS_ENTS_PER_PRODUCT = 3;
const TOTAL_CUS_ENTS = NUM_CUSTOMER_PRODUCTS * CUS_ENTS_PER_PRODUCT;
const WARMUP_ITERATIONS = 100;
const BENCHMARK_ITERATIONS = 1000;

const now = Date.now();

const buildSubjectBalance = ({ index }: { index: number }) => ({
	id: `cus_ent_${index}`,
	customer_product_id: `cp_${Math.floor(index / CUS_ENTS_PER_PRODUCT)}`,
	entitlement_id: `ent_${index}`,
	internal_customer_id: "cus_int_1",
	internal_entity_id: null,
	internal_feature_id: `feat_int_${index}`,
	feature_id: `feature_${index}`,
	unlimited: false,
	balance: 100 + index,
	adjustment: 0,
	additional_balance: 0,
	usage_allowed: true,
	next_reset_at: now + 86400000,
	expires_at: null,
	external_id: null,
	cache_version: 1,
	created_at: now,
	customer_id: "cus_1",
	rollovers: index % 5 === 0
		? [
				{
					id: `rollover_${index}`,
					cus_ent_id: `cus_ent_${index}`,
					balance: 50,
					usage: 10,
					expires_at: now + 172800000,
					entities: {},
				},
			]
		: [],
	entities: index % 3 === 0
		? {
				entity_a: { id: "entity_a", balance: 50, adjustment: 0 },
				entity_b: { id: "entity_b", balance: 30, adjustment: 0 },
			}
		: null,
	entitlement: {
		id: `ent_${index}`,
		created_at: now,
		internal_feature_id: `feat_int_${index}`,
		internal_product_id: `prod_int_${Math.floor(index / CUS_ENTS_PER_PRODUCT)}`,
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: 1000,
		interval: EntInterval.Month,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		org_id: "org_1",
		feature_id: `feature_${index}`,
		usage_limit: null,
		rollover: null,
		feature: {
			internal_id: `feat_int_${index}`,
			org_id: "org_1",
			created_at: now,
			env: AppEnv.Sandbox,
			id: `feature_${index}`,
			name: `Feature ${index}`,
			type: FeatureType.Metered,
			config: { usage_type: "single" },
			display: null,
			archived: false,
			event_names: ["track_event"],
		},
	},
	customerPrice: null,
	customerProductOptions: null,
	customerProductQuantity: 1,
});

const buildCachedFullSubject = (): CachedFullSubject => {
	const customerProducts = Array.from(
		{ length: NUM_CUSTOMER_PRODUCTS },
		(_, index) => ({
			id: `cp_${index}`,
			internal_product_id: `prod_int_${index}`,
			product_id: `prod_${index}`,
			internal_customer_id: "cus_int_1",
			customer_id: "cus_1",
			internal_entity_id: null,
			entity_id: null,
			created_at: now,
			status: CusProductStatus.Active,
			canceled: false,
			starts_at: now,
			trial_ends_at: null,
			canceled_at: null,
			ended_at: null,
			options: [
				{
					feature_id: `feature_${index * CUS_ENTS_PER_PRODUCT}`,
					quantity: 1,
					upcoming_quantity: null,
					adjustable_quantity: false,
					internal_feature_id: `feat_int_${index * CUS_ENTS_PER_PRODUCT}`,
				},
			],
			free_trial_id: null,
			collection_method: CollectionMethod.ChargeAutomatically,
			subscription_ids: ["sub_1"],
			scheduled_ids: null,
			processor: null,
			quantity: 1,
			api_semver: null,
			is_custom: false,
			billing_version: "v1" as const,
			external_id: null,
		}),
	);

	const entitlements = Array.from(
		{ length: TOTAL_CUS_ENTS },
		(_, index) => ({
			id: `ent_${index}`,
			created_at: now,
			internal_feature_id: `feat_int_${index}`,
			internal_product_id: `prod_int_${Math.floor(index / CUS_ENTS_PER_PRODUCT)}`,
			is_custom: false,
			allowance_type: AllowanceType.Fixed,
			allowance: 1000,
			interval: EntInterval.Month,
			interval_count: 1,
			carry_from_previous: false,
			entity_feature_id: null,
			org_id: "org_1",
			feature_id: `feature_${index}`,
			usage_limit: null,
			rollover: null,
			feature: {
				internal_id: `feat_int_${index}`,
				org_id: "org_1",
				created_at: now,
				env: AppEnv.Sandbox,
				id: `feature_${index}`,
				name: `Feature ${index}`,
				type: FeatureType.Metered,
				config: { usage_type: "single" },
				display: null,
				archived: false,
				event_names: ["track_event"],
			},
		}),
	);

	const products = Array.from(
		{ length: NUM_CUSTOMER_PRODUCTS },
		(_, index) => ({
			internal_id: `prod_int_${index}`,
			id: `prod_${index}`,
			name: `Product ${index}`,
			description: null,
			is_add_on: false,
			is_default: false,
			version: 1,
			group: "",
			env: AppEnv.Sandbox,
			org_id: "org_1",
			created_at: now,
			processor: null,
			base_variant_id: null,
			archived: false,
		}),
	);

	const customerEntitlementIdsByFeatureId: Record<string, string[]> = {};
	for (let i = 0; i < TOTAL_CUS_ENTS; i++) {
		customerEntitlementIdsByFeatureId[`feature_${i}`] = [`cus_ent_${i}`];
	}

	return {
		subjectType: "customer",
		customerId: "cus_1",
		internalCustomerId: "cus_int_1",
		customer: {
			id: "cus_1",
			internal_id: "cus_int_1",
			org_id: "org_1",
			env: AppEnv.Live,
			created_at: now,
			name: "Benchmark Customer",
			email: "bench@test.com",
			fingerprint: null,
			processor: null,
			processors: null,
			metadata: {},
			send_email_receipts: false,
			auto_topups: [],
			spend_limits: [],
			usage_alerts: [],
			overage_allowed: [],
		},
		customer_products: customerProducts,
		products,
		entitlements,
		prices: [],
		free_trials: [],
		subscriptions: [],
		invoices: [],
		flags: {},
		_cachedAt: now,
		meteredFeatures: Array.from({ length: TOTAL_CUS_ENTS }, (_, i) => `feature_${i}`),
		customerEntitlementIdsByFeatureId,
		subjectViewEpoch: 1,
	} as unknown as CachedFullSubject;
};

const subjectBalances = Array.from(
	{ length: TOTAL_CUS_ENTS },
	(_, index) => buildSubjectBalance({ index }),
);

const cachedFullSubject = buildCachedFullSubject();

const formatNs = (nanoseconds: bigint): string => {
	const microseconds = Number(nanoseconds) / 1000;
	if (microseconds < 1000) return `${microseconds.toFixed(1)}us`;
	return `${(microseconds / 1000).toFixed(3)}ms`;
};

console.log("=== Sanitize Benchmark ===");
console.log(`Customer products: ${NUM_CUSTOMER_PRODUCTS}`);
console.log(`CusEnts per product: ${CUS_ENTS_PER_PRODUCT}`);
console.log(`Total SubjectBalance blobs: ${TOTAL_CUS_ENTS}`);
console.log(`Warmup iterations: ${WARMUP_ITERATIONS}`);
console.log(`Benchmark iterations: ${BENCHMARK_ITERATIONS}`);
console.log();

// --- Benchmark: sanitizeCachedSubjectBalance (single) ---
for (let i = 0; i < WARMUP_ITERATIONS; i++) {
	sanitizeCachedSubjectBalance({ subjectBalance: subjectBalances[0] as any });
}

let singleTotal = 0n;
for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
	const balance = subjectBalances[i % subjectBalances.length];
	const start = Bun.nanoseconds();
	sanitizeCachedSubjectBalance({ subjectBalance: balance as any });
	singleTotal += BigInt(Math.round(Bun.nanoseconds() - start));
}
const singleAvg = singleTotal / BigInt(BENCHMARK_ITERATIONS);
console.log(`sanitizeCachedSubjectBalance (1 balance):`);
console.log(`  avg: ${formatNs(singleAvg)}`);
console.log(`  total for ${BENCHMARK_ITERATIONS} calls: ${formatNs(singleTotal)}`);
console.log();

// --- Benchmark: sanitizeCachedSubjectBalance (all 3000) ---
for (let i = 0; i < WARMUP_ITERATIONS; i++) {
	for (const balance of subjectBalances) {
		sanitizeCachedSubjectBalance({ subjectBalance: balance as any });
	}
}

let batchTotal = 0n;
for (let i = 0; i < 10; i++) {
	const start = Bun.nanoseconds();
	for (const balance of subjectBalances) {
		sanitizeCachedSubjectBalance({ subjectBalance: balance as any });
	}
	batchTotal += BigInt(Math.round(Bun.nanoseconds() - start));
}
const batchAvg = batchTotal / 10n;
console.log(`sanitizeCachedSubjectBalance (all ${TOTAL_CUS_ENTS} balances):`);
console.log(`  avg per full batch: ${formatNs(batchAvg)}`);
console.log(`  avg per balance: ${formatNs(batchAvg / BigInt(TOTAL_CUS_ENTS))}`);
console.log();

// --- Benchmark: sanitizeCachedFullSubject ---
for (let i = 0; i < WARMUP_ITERATIONS; i++) {
	sanitizeCachedFullSubject({ cachedFullSubject: cachedFullSubject });
}

let shellTotal = 0n;
for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
	const start = Bun.nanoseconds();
	sanitizeCachedFullSubject({ cachedFullSubject: cachedFullSubject });
	shellTotal += BigInt(Math.round(Bun.nanoseconds() - start));
}
const shellAvg = shellTotal / BigInt(BENCHMARK_ITERATIONS);
console.log(`sanitizeCachedFullSubject (${NUM_CUSTOMER_PRODUCTS} products, ${TOTAL_CUS_ENTS} entitlements):`);
console.log(`  avg: ${formatNs(shellAvg)}`);
console.log(`  total for ${BENCHMARK_ITERATIONS} calls: ${formatNs(shellTotal)}`);
console.log();

// --- Combined: full cache read sanitization ---
for (let i = 0; i < WARMUP_ITERATIONS; i++) {
	sanitizeCachedFullSubject({ cachedFullSubject: cachedFullSubject });
	for (const balance of subjectBalances) {
		sanitizeCachedSubjectBalance({ subjectBalance: balance as any });
	}
}

let combinedTotal = 0n;
for (let i = 0; i < 10; i++) {
	const start = Bun.nanoseconds();
	sanitizeCachedFullSubject({ cachedFullSubject: cachedFullSubject });
	for (const balance of subjectBalances) {
		sanitizeCachedSubjectBalance({ subjectBalance: balance as any });
	}
	combinedTotal += BigInt(Math.round(Bun.nanoseconds() - start));
}
const combinedAvg = combinedTotal / 10n;
console.log(`Combined (shell + all ${TOTAL_CUS_ENTS} balances):`);
console.log(`  avg: ${formatNs(combinedAvg)}`);
console.log();

// --- JSON.parse baseline for comparison ---
const serializedBalances = subjectBalances.map((balance) => JSON.stringify(balance));
const serializedShell = JSON.stringify(cachedFullSubject);

let parseTotal = 0n;
for (let i = 0; i < 10; i++) {
	const start = Bun.nanoseconds();
	JSON.parse(serializedShell);
	for (const json of serializedBalances) {
		JSON.parse(json);
	}
	parseTotal += BigInt(Math.round(Bun.nanoseconds() - start));
}
const parseAvg = parseTotal / 10n;
console.log(`Baseline: JSON.parse (shell + ${TOTAL_CUS_ENTS} balances):`);
console.log(`  avg: ${formatNs(parseAvg)}`);
console.log();

const overheadPct = Number(combinedAvg) / Number(parseAvg) * 100;
console.log(`Sanitize overhead vs JSON.parse: ${overheadPct.toFixed(1)}%`);
