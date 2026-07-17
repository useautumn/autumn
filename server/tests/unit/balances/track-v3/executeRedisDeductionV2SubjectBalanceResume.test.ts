/**
 * A cache cutover can remove feature B's balance after feature A has already
 * deducted. Resume must retry B in place without replaying A or losing A's sync metadata.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCustomerEntitlement,
	type FullSubject,
	type Organization,
	SubjectType,
} from "@autumn/shared";
import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "@/internal/balances/utils/types/redisDeductionError.js";
import type { LuaDeductionResult } from "@/internal/balances/utils/types/redisDeductionResult.js";

type SideEffectCall = {
	kind: "webhook" | "auto-top-up";
	featureId: string;
	redisCallCount: number;
	oldFullSubject?: FullSubject;
	newFullSubject: FullSubject;
};

const sideEffectCalls: SideEffectCall[] = [];

mock.module("@/internal/balances/trackWebhooks/fireTrackWebhooks.js", () => ({
	fireTrackWebhooks: ({
		oldFullSubject,
		newFullSubject,
		feature,
	}: {
		oldFullSubject?: FullSubject;
		newFullSubject: FullSubject;
		feature: Feature;
	}) => {
		sideEffectCalls.push({
			kind: "webhook",
			featureId: feature.id,
			redisCallCount: redisCalls.length,
			oldFullSubject: oldFullSubject
				? structuredClone(oldFullSubject)
				: undefined,
			newFullSubject: structuredClone(newFullSubject),
		});
	},
}));

mock.module("@/internal/balances/autoTopUp/triggerAutoTopUp.js", () => ({
	triggerAutoTopUp: async ({
		newFullCus,
		feature,
	}: {
		newFullCus: FullSubject;
		feature: Feature;
	}) => {
		sideEffectCalls.push({
			kind: "auto-top-up",
			featureId: feature.id,
			redisCallCount: redisCalls.length,
			newFullSubject: structuredClone(newFullCus) as unknown as FullSubject,
		});
	},
}));

mock.module(
	"@/internal/balances/utils/deductionV2/prepareDeductionOptionsV2.js",
	() => ({
		prepareDeductionOptionsV2: ({
			fullSubject,
			options = {},
		}: {
			fullSubject: FullSubject & { forcePaidAllocated?: boolean };
			options?: {
				overageBehaviour?: "cap" | "reject" | "allow";
				alterGrantedBalance?: boolean;
				customerEntitlementFilters?: unknown;
				eventProperties?: Record<string, unknown> | null;
				triggerAutoTopUp?: boolean;
			};
		}) => ({
			overageBehaviour: fullSubject.forcePaidAllocated
				? "reject"
				: (options.overageBehaviour ?? "cap"),
			skipAdditionalBalance: true,
			alterGrantedBalance: options.alterGrantedBalance ?? false,
			customerEntitlementFilters: options.customerEntitlementFilters,
			eventProperties: options.eventProperties,
			paidAllocatedV1: fullSubject.forcePaidAllocated ?? false,
			triggerAutoTopUp: options.triggerAutoTopUp ?? false,
		}),
	}),
);

type ExecuteRedisDeductionV2 =
	typeof import("@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js")["executeRedisDeductionV2"];

const { executeRedisDeductionV2 } = (await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js?subjectBalanceResumeSideEffects"
)) as { executeRedisDeductionV2: ExecuteRedisDeductionV2 };

const customerId = "multi-feature-resume-customer";

const buildFeature = (id: string): Feature =>
	({
		id,
		internal_id: `internal_${id}`,
		org_id: "org_1",
		env: AppEnv.Sandbox,
		name: id,
		type: FeatureType.Metered,
		config: null,
		display: null,
		created_at: 1,
		archived: false,
		event_names: [],
	}) as Feature;

const messagesFeature = buildFeature("messages");
const creditsFeature = buildFeature("credits");
const sharedCreditsFeature = {
	...buildFeature("shared_credits"),
	type: FeatureType.CreditSystem,
	config: {
		usage_type: FeatureUsageType.Single,
		schema: [
			{ metered_feature_id: messagesFeature.id, credit_amount: 1 },
			{ metered_feature_id: creditsFeature.id, credit_amount: 1 },
		],
	},
} as Feature;

const buildCustomerEntitlement = ({
	feature,
	balance,
}: {
	feature: Feature;
	balance: number;
}): FullCustomerEntitlement =>
	({
		id: `customer_entitlement_${feature.id}`,
		internal_customer_id: "internal_customer_1",
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
			org_id: "org_1",
			rollover: null,
			pooled: false,
			feature,
		},
		replaceables: [],
		rollovers: [],
	}) as FullCustomerEntitlement;

const buildFullSubject = ({
	messagesBalance,
	creditsBalance,
}: {
	messagesBalance: number;
	creditsBalance: number;
}): FullSubject =>
	({
		subjectType: SubjectType.Customer,
		customerId,
		internalCustomerId: "internal_customer_1",
		customer: {
			id: customerId,
			internal_id: "internal_customer_1",
			org_id: "org_1",
			env: AppEnv.Sandbox,
			created_at: 1,
			name: "Resume customer",
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
				feature: messagesFeature,
				balance: messagesBalance,
			}),
			buildCustomerEntitlement({
				feature: creditsFeature,
				balance: creditsBalance,
			}),
		],
		subscriptions: [],
		invoices: [],
	}) as FullSubject;

const buildSuccess = ({
	featureId,
	balance,
	deducted,
	additionalDeducted,
	customerEntitlementId = `customer_entitlement_${featureId}`,
}: {
	featureId: string;
	balance: number;
	deducted: number;
	additionalDeducted?: number;
	customerEntitlementId?: string;
}): LuaDeductionResult => {
	return {
		updates: {
			[customerEntitlementId]: {
				balance,
				additional_balance: 0,
				entities: {},
				adjustment: 0,
				deducted,
				additional_deducted: additionalDeducted,
			},
		},
		rollover_updates: {},
		modified_customer_entitlement_ids: [customerEntitlementId],
		mutation_logs: [
			{
				target_type: "customer_entitlement",
				customer_entitlement_id: customerEntitlementId,
				rollover_id: null,
				entity_id: null,
				credit_cost: 1,
				balance_delta: -deducted,
				adjustment_delta: 0,
				usage_delta: deducted,
				value_delta: deducted,
			},
		],
		remaining: 0,
	};
};

const subjectBalanceNotFound: LuaDeductionResult = {
	updates: {},
	rollover_updates: {},
	modified_customer_entitlement_ids: [],
	mutation_logs: [],
	remaining: 0,
	error: RedisDeductionErrorCode.SubjectBalanceNotFound,
	feature_id: creditsFeature.id,
};

const redisCalls: Array<{ featureId: string; idempotencyKey: string }> = [];
let redisOutcomes: LuaDeductionResult[] = [];
const redisInstance = {
	status: "ready",
	deductFromSubjectBalances: async (
		keyCount: number,
		...keysAndParams: string[]
	): Promise<string> => {
		const params = JSON.parse(
			keysAndParams[keysAndParams.length - 1] ?? "{}",
		) as {
			feature_id: string;
		};
		const keys = keysAndParams.slice(0, keyCount);
		redisCalls.push({
			featureId: params.feature_id,
			idempotencyKey: keys[2] ?? "",
		});
		const outcome = redisOutcomes.shift();
		if (!outcome) throw new Error("Missing mocked Lua outcome");
		return JSON.stringify(outcome);
	},
} as unknown as Redis;

const ctx = {
	org: { id: "org_1", config: {} } as Organization,
	env: AppEnv.Sandbox,
	features: [messagesFeature, creditsFeature],
	logger: {
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {},
	},
	id: "request_1",
	apiVersion: new ApiVersionClass(ApiVersion.V2_1),
	skipCache: false,
	redisV2: redisInstance,
} as unknown as AutumnContext;

const featureDeductions: FeatureDeduction[] = [
	{ feature: messagesFeature, deduction: 10 },
	{ feature: creditsFeature, deduction: 20 },
];

describe("executeRedisDeductionV2 subject-balance resume", () => {
	beforeEach(() => {
		redisCalls.length = 0;
		redisOutcomes = [];
		sideEffectCalls.length = 0;
	});

	test("retries only the missing feature and preserves prior aggregate metadata", async () => {
		const staleSubject = buildFullSubject({
			messagesBalance: 100,
			creditsBalance: 100,
		});
		const refreshedSubject = buildFullSubject({
			messagesBalance: 90,
			creditsBalance: 100,
		});
		redisOutcomes = [
			buildSuccess({
				featureId: messagesFeature.id,
				balance: 90,
				deducted: 10,
			}),
			subjectBalanceNotFound,
			buildSuccess({ featureId: creditsFeature.id, balance: 80, deducted: 20 }),
		];
		let refreshCalls = 0;

		const result = await executeRedisDeductionV2({
			ctx,
			fullSubject: staleSubject,
			deductions: featureDeductions,
			idempotencyKey: "track:request_1",
			redisInstance,
			onSubjectBalanceNotFound: async ({ featureDeduction }) => {
				refreshCalls += 1;
				expect(featureDeduction.feature.id).toBe(creditsFeature.id);
				return refreshedSubject;
			},
		});

		expect(redisCalls.map((call) => call.featureId)).toEqual([
			messagesFeature.id,
			creditsFeature.id,
			creditsFeature.id,
		]);
		expect(redisCalls[0]?.idempotencyKey).not.toBe(
			redisCalls[1]?.idempotencyKey,
		);
		expect(redisCalls[1]?.idempotencyKey).toBe(redisCalls[2]?.idempotencyKey);
		expect(refreshCalls).toBe(1);
		expect(result.fullSubject).toBe(refreshedSubject);
		expect(result.updates).toEqual({
			customer_entitlement_messages: expect.objectContaining({ balance: 90 }),
			customer_entitlement_credits: expect.objectContaining({ balance: 80 }),
		});
		expect(
			result.mutationLogs.map((log) => log.customer_entitlement_id),
		).toEqual([
			"customer_entitlement_messages",
			"customer_entitlement_credits",
		]);
		expect(result.modifiedCusEntIdsByFeatureId).toEqual({
			messages: ["customer_entitlement_messages"],
			credits: ["customer_entitlement_credits"],
		});
		expect(
			result.fullSubject.extra_customer_entitlements.map(
				(customerEntitlement) => customerEntitlement.balance,
			),
		).toEqual([90, 80]);
	});

	test("combines per-feature deductions that update the same customer entitlement", async () => {
		const sharedCustomerEntitlement = buildCustomerEntitlement({
			feature: sharedCreditsFeature,
			balance: 100,
		});
		const sharedSubject = {
			...buildFullSubject({ messagesBalance: 100, creditsBalance: 100 }),
			extra_customer_entitlements: [sharedCustomerEntitlement],
		} as FullSubject;
		const sharedCustomerEntitlementId = sharedCustomerEntitlement.id;
		const sharedCtx = {
			...ctx,
			features: [messagesFeature, creditsFeature, sharedCreditsFeature],
		} as AutumnContext;
		redisOutcomes = [
			buildSuccess({
				featureId: messagesFeature.id,
				customerEntitlementId: sharedCustomerEntitlementId,
				balance: 90,
				deducted: 10,
				additionalDeducted: 2,
			}),
			buildSuccess({
				featureId: creditsFeature.id,
				customerEntitlementId: sharedCustomerEntitlementId,
				balance: 70,
				deducted: 20,
				additionalDeducted: 3,
			}),
		];

		const result = await executeRedisDeductionV2({
			ctx: sharedCtx,
			fullSubject: sharedSubject,
			deductions: featureDeductions,
			idempotencyKey: "track:shared-credit-request",
			redisInstance,
		});

		expect(result.updates[sharedCustomerEntitlementId]).toEqual(
			expect.objectContaining({
				balance: 70,
				deducted: 30,
				additional_deducted: 5,
			}),
		);
		expect(
			result.mutationLogs.map((mutationLog) => ({
				customerEntitlementId: mutationLog.customer_entitlement_id,
				usageDelta: mutationLog.usage_delta,
			})),
		).toEqual([
			{ customerEntitlementId: sharedCustomerEntitlementId, usageDelta: 10 },
			{ customerEntitlementId: sharedCustomerEntitlementId, usageDelta: 20 },
		]);
		expect(result.modifiedCusEntIdsByFeatureId).toEqual({
			[sharedCreditsFeature.id]: [sharedCustomerEntitlementId],
		});
		expect(result.fullSubject.extra_customer_entitlements[0]?.balance).toBe(70);
	});

	test("bubbles a repeated miss without replaying an earlier feature", async () => {
		const staleSubject = buildFullSubject({
			messagesBalance: 100,
			creditsBalance: 100,
		});
		const refreshedSubject = buildFullSubject({
			messagesBalance: 90,
			creditsBalance: 100,
		});
		redisOutcomes = [
			buildSuccess({
				featureId: messagesFeature.id,
				balance: 90,
				deducted: 10,
			}),
			subjectBalanceNotFound,
			subjectBalanceNotFound,
		];
		let refreshCalls = 0;

		try {
			await executeRedisDeductionV2({
				ctx,
				fullSubject: staleSubject,
				deductions: featureDeductions,
				idempotencyKey: "track:request_1",
				redisInstance,
				onSubjectBalanceNotFound: async () => {
					refreshCalls += 1;
					return refreshedSubject;
				},
			});
			throw new Error("Expected the repeated subject-balance miss to bubble");
		} catch (error) {
			expect(error).toBeInstanceOf(RedisDeductionError);
			expect((error as RedisDeductionError).code).toBe(
				RedisDeductionErrorCode.SubjectBalanceNotFound,
			);
			expect((error as RedisDeductionError).shouldFallback()).toBe(false);
		}

		expect(redisCalls.map((call) => call.featureId)).toEqual([
			messagesFeature.id,
			creditsFeature.id,
			creditsFeature.id,
		]);
		expect(refreshCalls).toBe(1);
	});

	test("does not emit per-feature side effects when a later feature still cannot resume", async () => {
		const staleSubject = buildFullSubject({
			messagesBalance: 100,
			creditsBalance: 100,
		});
		const refreshedSubject = buildFullSubject({
			messagesBalance: 90,
			creditsBalance: 100,
		});
		redisOutcomes = [
			buildSuccess({
				featureId: messagesFeature.id,
				balance: 90,
				deducted: 10,
			}),
			subjectBalanceNotFound,
			subjectBalanceNotFound,
		];

		await expect(
			executeRedisDeductionV2({
				ctx,
				fullSubject: staleSubject,
				deductions: featureDeductions,
				idempotencyKey: "track:side-effect-failure",
				deductionOptions: { triggerAutoTopUp: true },
				redisInstance,
				onSubjectBalanceNotFound: async () => refreshedSubject,
			}),
		).rejects.toMatchObject({
			code: RedisDeductionErrorCode.SubjectBalanceNotFound,
		});

		expect(sideEffectCalls).toEqual([]);
	});

	test("defers side effects and compares a resumed feature against its refreshed baseline", async () => {
		const staleSubject = buildFullSubject({
			messagesBalance: 100,
			creditsBalance: 100,
		});
		const refreshedSubject = buildFullSubject({
			messagesBalance: 90,
			creditsBalance: 100,
		});
		redisOutcomes = [
			buildSuccess({
				featureId: messagesFeature.id,
				balance: 90,
				deducted: 10,
			}),
			subjectBalanceNotFound,
			buildSuccess({
				featureId: creditsFeature.id,
				balance: 80,
				deducted: 20,
			}),
		];

		await executeRedisDeductionV2({
			ctx,
			fullSubject: staleSubject,
			deductions: featureDeductions,
			idempotencyKey: "track:deferred-side-effects",
			deductionOptions: { triggerAutoTopUp: true },
			redisInstance,
			onSubjectBalanceNotFound: async () => refreshedSubject,
		});

		expect(sideEffectCalls).toHaveLength(4);
		expect(
			sideEffectCalls.map((sideEffectCall) => sideEffectCall.redisCallCount),
		).toEqual([3, 3, 3, 3]);

		const creditsWebhook = sideEffectCalls.find(
			(sideEffectCall) =>
				sideEffectCall.kind === "webhook" &&
				sideEffectCall.featureId === creditsFeature.id,
		);
		expect(
			creditsWebhook?.oldFullSubject?.extra_customer_entitlements.map(
				(customerEntitlement) => customerEntitlement.balance,
			),
		).toEqual([90, 100]);
		expect(
			creditsWebhook?.newFullSubject.extra_customer_entitlements.map(
				(customerEntitlement) => customerEntitlement.balance,
			),
		).toEqual([90, 80]);
	});

	test("revalidates refreshed paid-allocated state without unsafe fallback after an earlier Redis write", async () => {
		const staleSubject = buildFullSubject({
			messagesBalance: 100,
			creditsBalance: 100,
		});
		const refreshedSubject = Object.assign(
			buildFullSubject({ messagesBalance: 90, creditsBalance: 100 }),
			{ forcePaidAllocated: true },
		);
		redisOutcomes = [
			buildSuccess({
				featureId: messagesFeature.id,
				balance: 90,
				deducted: 10,
			}),
			subjectBalanceNotFound,
		];

		try {
			await executeRedisDeductionV2({
				ctx,
				fullSubject: staleSubject,
				deductions: featureDeductions,
				idempotencyKey: "track:paid-allocated-refresh",
				redisInstance,
				onSubjectBalanceNotFound: async () => refreshedSubject,
			});
			throw new Error("Expected refreshed paid-allocated state to be rejected");
		} catch (error) {
			expect(error).toBeInstanceOf(RedisDeductionError);
			expect((error as RedisDeductionError).code).toBe(
				RedisDeductionErrorCode.PaidAllocated,
			);
			expect((error as RedisDeductionError).shouldFallback()).toBe(false);
		}

		expect(redisCalls.map((redisCall) => redisCall.featureId)).toEqual([
			messagesFeature.id,
			creditsFeature.id,
		]);
		expect(sideEffectCalls).toEqual([]);
	});

	test("allows the normal Postgres fallback when refreshed paid-allocated state is found before any Redis write", async () => {
		const staleSubject = buildFullSubject({
			messagesBalance: 100,
			creditsBalance: 100,
		});
		const refreshedSubject = Object.assign(
			buildFullSubject({ messagesBalance: 100, creditsBalance: 100 }),
			{ forcePaidAllocated: true },
		);
		redisOutcomes = [subjectBalanceNotFound];

		try {
			await executeRedisDeductionV2({
				ctx,
				fullSubject: staleSubject,
				deductions: [featureDeductions[0]!],
				idempotencyKey: "track:paid-allocated-first-feature-refresh",
				redisInstance,
				onSubjectBalanceNotFound: async () => refreshedSubject,
			});
			throw new Error("Expected refreshed paid-allocated state to be rejected");
		} catch (error) {
			expect(error).toBeInstanceOf(RedisDeductionError);
			expect((error as RedisDeductionError).code).toBe(
				RedisDeductionErrorCode.PaidAllocated,
			);
			expect((error as RedisDeductionError).shouldFallback()).toBe(true);
		}

		expect(redisCalls.map((redisCall) => redisCall.featureId)).toEqual([
			messagesFeature.id,
		]);
		expect(sideEffectCalls).toEqual([]);
	});
});

afterAll(() => {
	mock.restore();
});
