/**
 * A cache cutover can remove feature B's balance after feature A has already
 * deducted. The real Redis/Lua path must rebuild and retry only B, preserving
 * A's completed deduction and both features' sync metadata.
 */

import { afterEach, beforeAll, expect, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type Feature,
	FeatureType,
	type FullCustomerEntitlement,
	type FullSubject,
	SubjectType,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { waitForRedisReady } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getRedisTrackFeatureIdempotencyKey } from "@/internal/balances/track/v3/trackIdempotencyKey.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";

const customerId = "redis-multi-feature-resume-customer";
const requestId = "redis-multi-feature-resume-request";
const messagesFeatureId = "resume_messages";
const creditsFeatureId = "resume_credits";

const buildFeature = (id: string): Feature =>
	({
		id,
		internal_id: `internal_${id}`,
		org_id: ctx.org.id,
		env: AppEnv.Sandbox,
		name: id,
		type: FeatureType.Metered,
		config: null,
		display: null,
		created_at: 1,
		archived: false,
		event_names: [],
	}) as Feature;

const buildCustomerEntitlement = ({
	feature,
	balance,
}: {
	feature: Feature;
	balance: number;
}): FullCustomerEntitlement =>
	({
		id: `customer_entitlement_${feature.id}`,
		internal_customer_id: "internal_redis_resume_customer",
		internal_entity_id: null,
		internal_feature_id: feature.internal_id,
		customer_id: customerId,
		feature_id: feature.id,
		customer_product_id: null,
		entitlement_id: `entitlement_${feature.id}`,
		created_at: 1,
		unlimited: false,
		balance,
		additional_balance: 0,
		usage_allowed: false,
		separate_interval: false,
		reset_cycle_anchor: null,
		next_reset_at: null,
		adjustment: 0,
		expires_at: null,
		cache_version: 0,
		entities: null,
		external_id: null,
		entitlement: {
			id: `entitlement_${feature.id}`,
			internal_product_id: null,
			internal_feature_id: feature.internal_id,
			feature_id: feature.id,
			allowance_type: "fixed",
			allowance: 100,
			interval: "month",
			interval_count: 1,
			usage_limit: null,
			carry_from_previous: false,
			created_at: 1,
			entity_feature_id: null,
			is_custom: true,
			org_id: ctx.org.id,
			rollover: null,
			pooled: false,
			feature,
		},
		replaceables: [],
		rollovers: [],
	}) as FullCustomerEntitlement;

const buildFullSubject = ({
	features,
	messagesBalance,
	creditsBalance,
}: {
	features: { messages: Feature; credits: Feature };
	messagesBalance: number;
	creditsBalance: number;
}): FullSubject =>
	({
		subjectType: SubjectType.Customer,
		customerId,
		internalCustomerId: "internal_redis_resume_customer",
		customer: {
			id: customerId,
			internal_id: "internal_redis_resume_customer",
			org_id: ctx.org.id,
			env: AppEnv.Sandbox,
			created_at: 1,
			name: "Redis resume customer",
			email: null,
			fingerprint: null,
			processor: null,
			processors: {},
			metadata: {},
			config: {},
			send_email_receipts: false,
			auto_topups: null,
			spend_limits: null,
			usage_alerts: null,
			overage_allowed: null,
		},
		customer_products: [],
		extra_customer_entitlements: [
			buildCustomerEntitlement({
				feature: features.messages,
				balance: messagesBalance,
			}),
			buildCustomerEntitlement({
				feature: features.credits,
				balance: creditsBalance,
			}),
		],
		subscriptions: [],
		invoices: [],
	}) as FullSubject;

const messagesBalanceKey = buildSharedFullSubjectBalanceKey({
	orgId: ctx.org.id,
	env: ctx.env,
	customerId,
	featureId: messagesFeatureId,
});
const creditsBalanceKey = buildSharedFullSubjectBalanceKey({
	orgId: ctx.org.id,
	env: ctx.env,
	customerId,
	featureId: creditsFeatureId,
});

const buildRedisContext = (): AutumnContext =>
	({
		...ctx,
		id: requestId,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		features: [buildFeature(messagesFeatureId), buildFeature(creditsFeatureId)],
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
			debug: () => {},
		},
	}) as unknown as AutumnContext;

const cleanupKeys = (): string[] => {
	const redisContext = buildRedisContext();
	return [
		messagesBalanceKey,
		creditsBalanceKey,
		getRedisTrackFeatureIdempotencyKey({
			ctx: redisContext,
			customerId,
			featureId: messagesFeatureId,
		}).redisKey,
		getRedisTrackFeatureIdempotencyKey({
			ctx: redisContext,
			customerId,
			featureId: creditsFeatureId,
		}).redisKey,
	];
};

beforeAll(async () => {
	await waitForRedisReady(ctx.redisV2, "redis-multi-feature-resume", 5000);
});

afterEach(async () => {
	await ctx.redisV2.del(...cleanupKeys());
});

test("executeRedisDeductionV2 resumes a multi-feature deduction against real Lua without replaying the completed feature", async () => {
	await ctx.redisV2.del(...cleanupKeys());

	const redisContext = buildRedisContext();
	const [messagesFeature, creditsFeature] = redisContext.features;
	const staleSubject = buildFullSubject({
		features: { messages: messagesFeature, credits: creditsFeature },
		messagesBalance: 100,
		creditsBalance: 100,
	});
	const [messagesCustomerEntitlement, creditsCustomerEntitlement] =
		staleSubject.extra_customer_entitlements;

	await ctx.redisV2
		.pipeline()
		.hset(
			messagesBalanceKey,
			messagesCustomerEntitlement.id,
			JSON.stringify(messagesCustomerEntitlement),
		)
		.hset(
			creditsBalanceKey,
			creditsCustomerEntitlement.id,
			JSON.stringify(creditsCustomerEntitlement),
		)
		.exec();

	type LuaCall = {
		featureId: string;
		error?: string | null;
		updatedCustomerEntitlementIds: string[];
	};
	const luaCalls: LuaCall[] = [];
	let creditsAttempts = 0;
	const redisV2 = new Proxy(ctx.redisV2, {
		get(target, property) {
			if (property === "deductFromSubjectBalances") {
				return async (...args: [number, string, ...string[]]) => {
					const [, ...keysAndParams] = args;
					const params = JSON.parse(
						keysAndParams[keysAndParams.length - 1] ?? "{}",
					) as {
						feature_id: string;
					};

					if (params.feature_id === creditsFeatureId) {
						creditsAttempts += 1;
						if (creditsAttempts === 1) {
							await target.hdel(
								creditsBalanceKey,
								creditsCustomerEntitlement.id,
							);
						}
					}

					const rawResult = await target.deductFromSubjectBalances(...args);
					const parsedResult = JSON.parse(rawResult) as {
						error?: string;
						updates?: Record<string, unknown>;
					};
					luaCalls.push({
						featureId: params.feature_id,
						error: parsedResult.error,
						updatedCustomerEntitlementIds: Object.keys(
							parsedResult.updates ?? {},
						),
					});
					return rawResult;
				};
			}

			const value = Reflect.get(target, property, target) as unknown;
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as AutumnContext["redisV2"];
	const deductionContext = { ...redisContext, redisV2 } as AutumnContext;
	let refreshCalls = 0;
	let refreshedSubject: FullSubject | undefined;

	const result = await executeRedisDeductionV2({
		ctx: deductionContext,
		fullSubject: staleSubject,
		deductions: [
			{ feature: messagesFeature, deduction: 10 },
			{ feature: creditsFeature, deduction: 20 },
		],
		idempotencyKey: "multi-feature-real-redis-resume",
		redisInstance: redisV2,
		onSubjectBalanceNotFound: async ({ fullSubject, featureDeduction }) => {
			refreshCalls += 1;
			expect(featureDeduction.feature.id).toBe(creditsFeatureId);
			expect(
				fullSubject.extra_customer_entitlements.map(
					(customerEntitlement) => customerEntitlement.balance,
				),
			).toEqual([90, 100]);

			refreshedSubject = structuredClone(fullSubject);
			const refreshedCredits =
				refreshedSubject.extra_customer_entitlements.find(
					(customerEntitlement) =>
						customerEntitlement.id === creditsCustomerEntitlement.id,
				);
			if (!refreshedCredits) {
				throw new Error("Expected refreshed credits customer entitlement");
			}
			await ctx.redisV2.hset(
				creditsBalanceKey,
				refreshedCredits.id,
				JSON.stringify(refreshedCredits),
			);
			return refreshedSubject;
		},
	});

	if (!refreshedSubject) throw new Error("Expected refreshed FullSubject");
	expect(luaCalls).toEqual([
		{
			featureId: messagesFeatureId,
			error: null,
			updatedCustomerEntitlementIds: [messagesCustomerEntitlement.id],
		},
		{
			featureId: creditsFeatureId,
			error: "SUBJECT_BALANCE_NOT_FOUND",
			updatedCustomerEntitlementIds: [],
		},
		{
			featureId: creditsFeatureId,
			error: null,
			updatedCustomerEntitlementIds: [creditsCustomerEntitlement.id],
		},
	]);
	expect(refreshCalls).toBe(1);
	expect(result.fullSubject).toBe(refreshedSubject);
	expect(result.updates).toEqual({
		[messagesCustomerEntitlement.id]: expect.objectContaining({
			balance: 90,
			deducted: 10,
		}),
		[creditsCustomerEntitlement.id]: expect.objectContaining({
			balance: 80,
			deducted: 20,
		}),
	});
	expect(
		result.mutationLogs.map((mutationLog) => ({
			customerEntitlementId: mutationLog.customer_entitlement_id,
			balanceDelta: mutationLog.balance_delta,
		})),
	).toEqual([
		{
			customerEntitlementId: messagesCustomerEntitlement.id,
			balanceDelta: -10,
		},
		{
			customerEntitlementId: creditsCustomerEntitlement.id,
			balanceDelta: -20,
		},
	]);
	expect(result.modifiedCusEntIdsByFeatureId).toEqual({
		[messagesFeatureId]: [messagesCustomerEntitlement.id],
		[creditsFeatureId]: [creditsCustomerEntitlement.id],
	});

	const [messagesRaw, creditsRaw] = await Promise.all([
		ctx.redisV2.hget(messagesBalanceKey, messagesCustomerEntitlement.id),
		ctx.redisV2.hget(creditsBalanceKey, creditsCustomerEntitlement.id),
	]);
	expect(messagesRaw && JSON.parse(messagesRaw)).toMatchObject({
		balance: 90,
	});
	expect(creditsRaw && JSON.parse(creditsRaw)).toMatchObject({ balance: 80 });
});
