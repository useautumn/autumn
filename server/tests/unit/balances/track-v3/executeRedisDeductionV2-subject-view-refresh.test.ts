import { afterAll, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type Feature,
	type FullCusEntWithFullCusProduct,
	type FullCustomerEntitlement,
	type FullSubject,
	SubjectType,
} from "@autumn/shared";
import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { projectMutationLogsToTrackDeductionsV2 } from "@/internal/balances/utils/deductionV2/projectMutationLogsToTrackDeductionsV2.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

await mockModuleWithRestore(
	"@/internal/balances/trackWebhooks/fireTrackWebhooks.js",
	() => ({ fireTrackWebhooks: () => {} }),
);

const { executeRedisDeductionV2 } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js?subjectViewRefresh"
);

const buildFeature = (id: string): Feature =>
	({
		id,
		internal_id: `feature_${id}`,
		org_id: "org_123",
		env: AppEnv.Sandbox,
		name: id,
		type: "metered",
		config: null,
		display: null,
		created_at: 1,
		archived: false,
		event_names: [],
	}) as Feature;

const featureA = buildFeature("feature_a");
const featureB = buildFeature("feature_b");

const buildCustomerEntitlement = ({
	id,
	feature,
}: {
	id: string;
	feature: Feature;
}): FullCustomerEntitlement =>
	({
		id,
		internal_customer_id: "customer_internal_123",
		internal_entity_id: null,
		internal_feature_id: feature.internal_id,
		customer_id: "customer_123",
		feature_id: feature.id,
		customer_product_id: null,
		entitlement_id: `entitlement_${id}`,
		created_at: 1,
		unlimited: false,
		balance: 10,
		additional_balance: 0,
		usage_allowed: true,
		separate_interval: false,
		next_reset_at: null,
		adjustment: 0,
		expires_at: null,
		cache_version: 0,
		entities: null,
		external_id: null,
		entitlement: {
			id: `entitlement_${id}`,
			internal_product_id: `product_${feature.id}`,
			internal_feature_id: feature.internal_id,
			feature_id: feature.id,
			allowance_type: "fixed",
			allowance: 10,
			interval: "month",
			interval_count: 1,
			usage_limit: null,
			carry_from_previous: false,
			created_at: 1,
			entity_feature_id: null,
			is_custom: false,
			org_id: "org_123",
			rollover: null,
			feature,
		},
		replaceables: [],
		rollovers: [],
	}) as unknown as FullCustomerEntitlement;

const buildFullSubject = ({
	epoch,
	featureAEntitlementId,
	featureBEntitlementId,
}: {
	epoch: number;
	featureAEntitlementId: string;
	featureBEntitlementId: string;
}): FullSubject =>
	({
		subjectType: SubjectType.Customer,
		customerId: "customer_123",
		internalCustomerId: "customer_internal_123",
		subjectViewEpoch: epoch,
		customer: {
			id: "customer_123",
			internal_id: "customer_internal_123",
			org_id: "org_123",
			env: AppEnv.Sandbox,
			created_at: 1,
			config: {},
		},
		customer_products: [],
		extra_customer_entitlements: [
			buildCustomerEntitlement({
				id: featureAEntitlementId,
				feature: featureA,
			}),
			buildCustomerEntitlement({
				id: featureBEntitlementId,
				feature: featureB,
			}),
		],
		pooled_customer_entitlements: [],
		invoices: [],
	}) as unknown as FullSubject;

const buildSuccessResult = ({
	customerEntitlementId,
	featureId,
	balance,
}: {
	customerEntitlementId: string;
	featureId: string;
	balance: number;
}) =>
	JSON.stringify({
		updates: {
			[customerEntitlementId]: {
				balance,
				additional_balance: 0,
				adjustment: 0,
				entities: {},
				deducted: 1,
			},
		},
		rollover_updates: {},
		mutation_logs: [
			{
				target_type: "customer_entitlement",
				customer_entitlement_id: customerEntitlementId,
				rollover_id: null,
				entity_id: null,
				credit_cost: 1,
				balance_delta: -1,
				adjustment_delta: 0,
				usage_delta: 1,
				value_delta: 1,
			},
		],
		modified_customer_entitlement_ids: [customerEntitlementId],
		usage_window_mutations: [],
		usage_windows_by_feature_id: {},
		feature_id: featureId,
	});

test("refreshes once and retries only the unfinished feature", async () => {
	const sourceSubject = buildFullSubject({
		epoch: 1,
		featureAEntitlementId: "feature_a_source",
		featureBEntitlementId: "feature_b_source",
	});
	const targetSubject = buildFullSubject({
		epoch: 2,
		featureAEntitlementId: "feature_a_target",
		featureBEntitlementId: "feature_b_target",
	});
	const redisFeatureCalls: string[] = [];
	const redisResults = [
		buildSuccessResult({
			customerEntitlementId: "feature_a_source",
			featureId: "feature_a",
			balance: 9,
		}),
		JSON.stringify({ error: "SUBJECT_VIEW_CHANGED", feature_id: "feature_b" }),
		buildSuccessResult({
			customerEntitlementId: "feature_b_target",
			featureId: "feature_b",
			balance: 9,
		}),
	];
	const redis = {
		status: "ready",
		deductFromSubjectBalances: async (...args: unknown[]) => {
			const params = JSON.parse(String(args[args.length - 1])) as {
				feature_id: string;
			};
			redisFeatureCalls.push(params.feature_id);
			return redisResults.shift();
		},
	} as unknown as Redis;
	const logger = {
		info: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {}),
		debug: mock(() => {}),
	};
	const ctx = {
		org: { id: "org_123", config: {} },
		env: AppEnv.Sandbox,
		features: [featureA, featureB],
		logger,
		id: "request_123",
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		skipCache: false,
		redisV2: redis,
	} as unknown as AutumnContext;
	const featureDeductions: FeatureDeduction[] = [
		{ feature: featureA, deduction: 1 },
		{ feature: featureB, deduction: 1 },
	];
	let refreshCount = 0;

	const result = await executeRedisDeductionV2({
		ctx,
		fullSubject: sourceSubject,
		deductions: featureDeductions,
		redisInstance: redis,
		expectedSubjectViewEpoch: 1,
		refreshFullSubject: async () => {
			refreshCount += 1;
			return targetSubject;
		},
	});

	expect(redisFeatureCalls).toEqual(["feature_a", "feature_b", "feature_b"]);
	expect(refreshCount).toBe(1);
	expect(
		result.mutationLogs.map(
			(log: MutationLogItem) => log.customer_entitlement_id,
		),
	).toEqual(["feature_a_source", "feature_b_target"]);
	expect(result.modifiedCusEntIdsByFeatureId).toEqual({
		feature_a: ["feature_a_target"],
		feature_b: ["feature_b_target"],
	});
	expect(Object.keys(result.updates)).toEqual(["feature_b_target"]);
	expect(
		result.mutationLogCustomerEntitlements.map(
			(customerEntitlement: FullCusEntWithFullCusProduct) =>
				customerEntitlement.id,
		),
	).toEqual([
		"feature_a_source",
		"feature_b_source",
		"feature_a_target",
		"feature_b_target",
	]);

	const projectedDeductions = projectMutationLogsToTrackDeductionsV2({
		fullSubject: result.fullSubject,
		mutationLogs: result.mutationLogs,
		customerEntitlements: result.mutationLogCustomerEntitlements,
	});
	expect(projectedDeductions.map((deduction) => deduction.balance_id)).toEqual([
		"feature_a_source",
		"feature_b_target",
	]);
});

afterAll(() => {
	mock.restore();
});
