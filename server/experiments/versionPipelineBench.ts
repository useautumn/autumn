import {
    AffectedResource,
    AllowanceType,
    type ApiCustomerV5,
    ApiVersion,
    ApiVersionClass,
    applyResponseVersionChanges,
    AppEnv,
    BillingInterval,
    CollectionMethod,
    type CustomerLegacyData,
    CusProductStatus,
    EntInterval,
    FeatureType,
    type FullCustomer,
    type FullCustomerEntitlement,
    type FullCusProduct
} from "@autumn/shared";
import chalk from "chalk";
import { getApiCustomerBase } from "../src/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase";

const CUSTOMER_COUNT = 1000;
const ITERATIONS = 5;
const WARMUP_ITERATIONS = 2;

const ORG_ID = "org_bench";
const FEATURE_IDS = [
	"messages",
	"credits",
	"users",
	"projects",
	"api_calls",
	"storage_gb",
	"connectors",
	"webhooks",
	"exports",
	"dashboards",
];
const ADDON_FEATURE_IDS = [
	"extra_messages",
	"extra_credits",
	"premium_support",
	"sso",
	"audit_log",
];
const LOOSE_FEATURE_IDS = [
	"loose_a",
	"loose_b",
	"loose_c",
	"loose_d",
	"loose_e",
];

const featureFromId = (id: string) => ({
	internal_id: `fe_${id}`,
	org_id: ORG_ID,
	created_at: 1000,
	env: AppEnv.Sandbox,
	id,
	name: id,
	type: FeatureType.Metered,
	config: { usage_type: "single_use" },
	display: { singular: id, plural: `${id}s` },
	archived: false,
	event_names: [id],
});

const allFeatures = [
	...FEATURE_IDS.map(featureFromId),
	...ADDON_FEATURE_IDS.map(featureFromId),
	...LOOSE_FEATURE_IDS.map(featureFromId),
];

const makeEntitlement = ({
	cusEntId,
	productInternalId,
	productCusId,
	featureId,
	internalCustomerId,
	customerId,
}: {
	cusEntId: string;
	productInternalId: string;
	productCusId: string | null;
	featureId: string;
	internalCustomerId: string;
	customerId: string;
}): FullCustomerEntitlement => ({
	id: cusEntId,
	internal_customer_id: internalCustomerId,
	internal_entity_id: null,
	internal_feature_id: `fe_${featureId}`,
	customer_id: customerId,
	feature_id: featureId,
	customer_product_id: productCusId,
	entitlement_id: `ent_${featureId}_${productInternalId}`,
	created_at: 1000,
	unlimited: false,
	balance: 100,
	additional_balance: 0,
	usage_allowed: null,
	next_reset_at: 2000,
	adjustment: 0,
	expires_at: null,
	cache_version: 0,
	entities: null,
	external_id: null,
	entitlement: {
		id: `ent_${featureId}_${productInternalId}`,
		created_at: 1000,
		internal_feature_id: `fe_${featureId}`,
		internal_product_id: productInternalId,
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: 100,
		interval: EntInterval.Month,
		interval_count: 1,
		entity_feature_id: null,
		feature_id: featureId,
		usage_limit: null,
		feature: featureFromId(featureId),
	},
	replaceables: [],
	rollovers: [],
});

const makeCusProduct = ({
	productCusId,
	productInternalId,
	productId,
	productName,
	isAddOn,
	internalCustomerId,
	customerId,
	featureIds,
	cusEntPrefix,
	internalEntityId,
	entityId,
}: {
	productCusId: string;
	productInternalId: string;
	productId: string;
	productName: string;
	isAddOn: boolean;
	internalCustomerId: string;
	customerId: string;
	featureIds: string[];
	cusEntPrefix: string;
	internalEntityId?: string | null;
	entityId?: string | null;
}): FullCusProduct => ({
	id: productCusId,
	internal_product_id: productInternalId,
	product_id: productId,
	internal_customer_id: internalCustomerId,
	customer_id: customerId,
	internal_entity_id: internalEntityId ?? null,
	entity_id: entityId ?? null,
	created_at: 1500,
	updated_at: null,
	status: CusProductStatus.Active,
	canceled: false,
	starts_at: 1500,
	access_starts_at: null,
	trial_ends_at: null,
	billing_cycle_anchor_resets_at: null,
	canceled_at: null,
	ended_at: null,
	options: [],
	free_trial_id: null,
	collection_method: CollectionMethod.ChargeAutomatically,
	subscription_ids: [`sub_${productCusId}`],
	scheduled_ids: [],
	processor: { type: "stripe" as any },
	quantity: 1,
	api_semver: null,
	is_custom: false,
	billing_version: "v2" as any,
	external_id: null,
	stripe_checkout_session_id: null,
	customer_prices: [
		{
			id: `cus_price_${productCusId}`,
			internal_customer_id: internalCustomerId,
			customer_product_id: productCusId,
			created_at: 1500,
			price_id: `price_${productInternalId}`,
			price: {
				id: `price_${productInternalId}`,
				internal_product_id: productInternalId,
				org_id: ORG_ID,
				created_at: 1500,
				billing_type: null,
				tier_behavior: null,
				is_custom: false,
				config: {
					type: "fixed",
					amount: 99,
					interval: BillingInterval.Month,
				} as any,
				entitlement_id: null,
				proration_config: null,
			},
		},
	],
	customer_entitlements: featureIds.map((fid, i) =>
		makeEntitlement({
			cusEntId: `${cusEntPrefix}_${i}`,
			productInternalId,
			productCusId,
			featureId: fid,
			internalCustomerId,
			customerId,
		}),
	),
	product: {
		id: productId,
		name: productName,
		description: null,
		is_add_on: isAddOn,
		is_default: false,
		version: 1,
		group: "",
		env: AppEnv.Sandbox,
		internal_id: productInternalId,
		org_id: ORG_ID,
		created_at: 1000,
		processor: { type: "stripe", id: `prod_${productId}` },
		base_variant_id: null,
		archived: false,
		config: { ignore_past_due: false },
	},
	free_trial: null,
});

const makeFullCustomer = (idx: number): FullCustomer => {
	const internalId = `cus_bench_${idx.toString().padStart(8, "0")}`;
	const customerId = `bench_${idx}`;

	const customerProducts: FullCusProduct[] = [
		makeCusProduct({
			productCusId: `cus_prod_main_${idx}`,
			productInternalId: "prod_main",
			productId: "pro",
			productName: "Pro",
			isAddOn: false,
			internalCustomerId: internalId,
			customerId,
			featureIds: FEATURE_IDS,
			cusEntPrefix: `cus_ent_main_${idx}`,
		}),
		makeCusProduct({
			productCusId: `cus_prod_addon_${idx}`,
			productInternalId: "prod_addon",
			productId: "pro_addon",
			productName: "Pro Add-on",
			isAddOn: true,
			internalCustomerId: internalId,
			customerId,
			featureIds: ADDON_FEATURE_IDS,
			cusEntPrefix: `cus_ent_addon_${idx}`,
		}),
	];

	const entities = Array.from({ length: 5 }, (_, i) => ({
		id: `ent_${idx}_${i}`,
		org_id: ORG_ID,
		created_at: 1100,
		internal_id: `ent_int_${idx}_${i}`,
		internal_customer_id: internalId,
		env: AppEnv.Sandbox,
		name: `Entity ${i}`,
		deleted: false,
		feature_id: "seats",
		internal_feature_id: "fe_seats",
	}));

	for (let i = 0; i < 3; i++) {
		const ent = entities[i]!;
		customerProducts.push(
			makeCusProduct({
				productCusId: `cus_prod_main_${idx}_e${i}`,
				productInternalId: "prod_main",
				productId: "pro",
				productName: "Pro (Entity-scoped)",
				isAddOn: false,
				internalCustomerId: internalId,
				customerId,
				featureIds: FEATURE_IDS,
				cusEntPrefix: `cus_ent_main_${idx}_e${i}`,
				internalEntityId: ent.internal_id,
				entityId: ent.id,
			}),
		);
	}

	const looseEnts: FullCustomerEntitlement[] = LOOSE_FEATURE_IDS.map((fid, i) =>
		makeEntitlement({
			cusEntId: `cus_ent_loose_${idx}_${i}`,
			productInternalId: "prod_loose",
			productCusId: null,
			featureId: fid,
			internalCustomerId: internalId,
			customerId,
		}),
	);

	return {
		id: customerId,
		name: `Bench Customer ${idx}`,
		email: `bench+${idx}@autumn.dev`,
		fingerprint: null,
		internal_id: internalId,
		org_id: ORG_ID,
		created_at: 1000,
		env: AppEnv.Sandbox,
		processor: { id: `cus_stripe_${idx}`, type: "stripe" },
		processors: null,
		metadata: {},
		send_email_receipts: false,
		auto_topups: null,
		spend_limits: null,
		usage_alerts: null,
		overage_allowed: null,
		config: null,
		customer_products: customerProducts,
		entities,
		extra_customer_entitlements: looseEnts,
		subscriptions: customerProducts
			.filter((cp) => cp.subscription_ids?.length)
			.flatMap((cp) =>
				(cp.subscription_ids ?? []).map((sid) => ({
					id: sid,
					stripe_id: sid,
					stripe_schedule_id: null,
					created_at: 1500,
					usage_features: [],
					metadata: {},
					org_id: ORG_ID,
					env: AppEnv.Sandbox,
					current_period_start: 1500,
					current_period_end: 4000,
				})),
			),
	} as unknown as FullCustomer;
};

const makeCtx = () =>
	({
		org: {
			id: ORG_ID,
			slug: "bench",
			created_at: 1000,
			default_currency: "usd",
			config: { in_statuses: [CusProductStatus.Active] },
			stripe_connected: false,
		},
		env: AppEnv.Sandbox,
		features: allFeatures,
		logger: {
			info: () => {},
			error: () => {},
			warn: () => {},
			debug: () => {},
			trace: () => {},
			child: () => makeCtx().logger,
		},
		expand: [],
		apiVersion: new ApiVersionClass(ApiVersion.V2_3),
	}) as any;

const summarize = (samples: number[]) => {
	const sorted = [...samples].sort((a, b) => a - b);
	return {
		min: sorted[0] ?? 0,
		p50: sorted[Math.floor(sorted.length / 2)] ?? 0,
		p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
		max: sorted[sorted.length - 1] ?? 0,
		mean: samples.reduce((a, b) => a + b, 0) / samples.length,
	};
};

const fmt = (n: number) => `${n.toFixed(2)}ms`.padStart(9, " ");

const runSerial = async (customers: FullCustomer[], ctx: any) => {
	const finals: ApiCustomerV5[] = [];
	for (const fullCus of customers) {
		const { apiCustomer: baseCustomer, legacyData } = await getApiCustomerBase({
			ctx,
			fullCus,
			withAutumnId: false,
		});
		const versioned = applyResponseVersionChanges<ApiCustomerV5, CustomerLegacyData>({
			input: baseCustomer,
			legacyData,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Customer,
			ctx,
		});
		finals.push(versioned);
	}
	return finals;
};

const runPromiseAll = async (customers: FullCustomer[], ctx: any) => {
	const finals = await Promise.all(
		customers.map(async (fullCus) => {
			const { apiCustomer: baseCustomer, legacyData } = await getApiCustomerBase({
				ctx,
				fullCus,
				withAutumnId: false,
			});
			return applyResponseVersionChanges<ApiCustomerV5, CustomerLegacyData>({
				input: baseCustomer,
				legacyData,
				targetVersion: ctx.apiVersion,
				resource: AffectedResource.Customer,
				ctx,
			});
		}),
	);
	return finals;
};

// "sync-equivalent" path: keeps the async function calls but uses a tight
// promise-chained sequence with no extra microtask churn between customers.
// Since getApiCustomerBase is async, true sync isn't possible without rewriting it.
const runSyncEquivalent = (customers: FullCustomer[], ctx: any) => {
	let p: Promise<ApiCustomerV5[]> = Promise.resolve([] as ApiCustomerV5[]);
	for (const fullCus of customers) {
		p = p.then(async (acc) => {
			const { apiCustomer: baseCustomer, legacyData } = await getApiCustomerBase({
				ctx,
				fullCus,
				withAutumnId: false,
			});
			const versioned = applyResponseVersionChanges<ApiCustomerV5, CustomerLegacyData>({
				input: baseCustomer,
				legacyData,
				targetVersion: ctx.apiVersion,
				resource: AffectedResource.Customer,
				ctx,
			});
			acc.push(versioned);
			return acc;
		});
	}
	return p;
};

const benchVariant = async ({
	name,
	customers,
	ctx,
	run,
}: {
	name: string;
	customers: FullCustomer[];
	ctx: any;
	run: (customers: FullCustomer[], ctx: any) => Promise<ApiCustomerV5[]>;
}) => {
	for (let i = 0; i < WARMUP_ITERATIONS; i++) await run(customers, ctx);

	const samples: number[] = [];
	for (let i = 0; i < ITERATIONS; i++) {
		const t0 = performance.now();
		const result = await run(customers, ctx);
		const t1 = performance.now();
		if (result.length !== customers.length) {
			throw new Error(`${name}: result length mismatch ${result.length} vs ${customers.length}`);
		}
		samples.push(t1 - t0);
	}

	const s = summarize(samples);
	const perCustomer = s.p50 / customers.length;
	console.log(
		`  ${chalk.cyan(name.padEnd(20))} | total p50 ${fmt(s.p50)} (per cus ${perCustomer.toFixed(3)}ms) | mean ${fmt(s.mean)} | p95 ${fmt(s.p95)} | min ${fmt(s.min)} | max ${fmt(s.max)}`,
	);
	return s;
};

const main = async () => {
	console.log(
		chalk.magentaBright(
			`\n================ Version Pipeline Bench ================`,
		),
	);
	console.log(
		chalk.gray(
			`  customers per iter: ${CUSTOMER_COUNT.toLocaleString()}, iterations: ${ITERATIONS} (+${WARMUP_ITERATIONS} warmup)\n`,
		),
	);

	const ctx = makeCtx();
	const customers = Array.from({ length: CUSTOMER_COUNT }, (_, i) =>
		makeFullCustomer(i),
	);
	console.log(
		chalk.gray(
			`  shape per customer: ${customers[0]!.customer_products.length} cps · ${customers[0]!.customer_products.reduce((n, cp) => n + cp.customer_entitlements.length, 0)} bound ces · ${customers[0]!.extra_customer_entitlements.length} loose ces · ${customers[0]!.entities.length} entities`,
		),
	);
	console.log();

	console.log(chalk.bold("Baseline (serial for-await):"));
	const serial = await benchVariant({ name: "serial", customers, ctx, run: runSerial });

	console.log();
	console.log(chalk.bold("Variant A (Promise.all):"));
	const promiseAll = await benchVariant({
		name: "Promise.all",
		customers,
		ctx,
		run: runPromiseAll,
	});

	console.log();
	console.log(chalk.bold("Variant B (sync-equivalent promise chain):"));
	const syncish = await benchVariant({
		name: "sync-equivalent",
		customers,
		ctx,
		run: runSyncEquivalent,
	});

	const fmtDelta = (other: number, baseline: number) => {
		const delta = ((other - baseline) / baseline) * 100;
		const arrow = delta < 0 ? "↓" : "↑";
		return `${arrow}${Math.abs(delta).toFixed(1)}%`;
	};

	console.log();
	console.log(chalk.magentaBright("================ Summary ================"));
	console.log(
		`  serial:           ${fmt(serial.p50)} ${chalk.gray("(baseline)")}`,
	);
	console.log(
		`  Promise.all:      ${fmt(promiseAll.p50)} (${fmtDelta(promiseAll.p50, serial.p50)})`,
	);
	console.log(
		`  sync-equivalent:  ${fmt(syncish.p50)} (${fmtDelta(syncish.p50, serial.p50)})`,
	);
};

await main();
process.exit(0);