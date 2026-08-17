import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type FullSubject,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import {
	RedisDeductionError,
	type RedisDeductionErrorCode,
} from "@/internal/balances/utils/types/redisDeductionError.js";

import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const mockState = {
	fullSubjectReads: [] as FullSubject[],
	getOrSetCachedFullSubjectCalls: [] as Record<string, unknown>[],
	runRedisTrackV3Calls: [] as Record<string, unknown>[],
	runRedisTrackV3Errors: [] as Error[],
};

const fullSubject = {
	customerId: "cus_123",
	internalCustomerId: "cus_int_123",
	customer: {} as never,
	customer_products: [],
	extra_customer_entitlements: [],
	pooled_customer_entitlements: [],
	invoices: [],
	subjectType: "customer",
} as FullSubject;

const replacementFullSubject = {
	...fullSubject,
	customer_products: [{ id: "customer_product_b" }],
} as FullSubject;

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({
		getOrSetCachedFullSubject: async (args: Record<string, unknown>) => {
			mockState.getOrSetCachedFullSubjectCalls.push(args);
			return mockState.fullSubjectReads.shift() ?? fullSubject;
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject.js",
	() => ({
		getOrCreateCachedFullSubject: async () => fullSubject,
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/idempotency/trackQueueIdempotency.js",
	() => ({
		getTrackQueueIdempotencyKey: ({ ctx }: { ctx: { id: string } }) =>
			`track:${ctx.id}`,
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/track/v3/runRedisTrackV3.js",
	() => ({
		runRedisTrackV3: async (
			args: Record<string, unknown>,
		): Promise<TrackResponseV3> => {
			mockState.runRedisTrackV3Calls.push(args);
			const error = mockState.runRedisTrackV3Errors.shift();
			if (error) throw error;
			return {
				customer_id: "cus_123",
				value: 1,
				balance: null,
			};
		},
	}),
);

const { runTrackV3 } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/balances/track/v3/runTrackV3.js?runTrackV3Idempotency"
);

const ctx = {
	apiVersion: new ApiVersionClass(ApiVersion.V2_1),
	env: AppEnv.Sandbox,
	org: { id: "org_123" },
	id: "req_123",
} as AutumnContext;

const buildFeatureDeduction = (featureId: string): FeatureDeduction =>
	({
		feature: {
			id: featureId,
		},
		deduction: 1,
	}) as FeatureDeduction;

const subjectViewChangedError = () =>
	new RedisDeductionError({
		message: "Subject view changed",
		code: "SUBJECT_VIEW_CHANGED" as RedisDeductionErrorCode,
	});

describe("runTrackV3 idempotency routing", () => {
	beforeEach(() => {
		mockState.fullSubjectReads = [];
		mockState.getOrSetCachedFullSubjectCalls = [];
		mockState.runRedisTrackV3Calls = [];
		mockState.runRedisTrackV3Errors = [];
	});

	test("uses the same request-level key for multi-feature requests", async () => {
		await runTrackV3({
			ctx,
			body: {
				customer_id: "cus_123",
				event_name: "message.sent",
				idempotency_key: "idem_123",
				value: 1,
			},
			featureDeductions: [
				buildFeatureDeduction("messages"),
				buildFeatureDeduction("credits"),
			],
			apiVersion: ApiVersion.V2_1,
		});

		expect(mockState.runRedisTrackV3Calls).toHaveLength(1);
		expect(mockState.runRedisTrackV3Calls[0]?.idempotencyKey).toBe(
			"track:req_123",
		);
	});

	test("uses atomic Redis idempotency for single-feature requests", async () => {
		await runTrackV3({
			ctx,
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
				idempotency_key: "idem_123",
				value: 1,
			},
			featureDeductions: [buildFeatureDeduction("messages")],
			apiVersion: ApiVersion.V2_1,
		});

		expect(mockState.runRedisTrackV3Calls).toHaveLength(1);
		expect(mockState.runRedisTrackV3Calls[0]?.idempotencyKey).toBe(
			"track:req_123",
		);
	});

	test("uses the request id when client idempotency key is missing", async () => {
		await runTrackV3({
			ctx,
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
				value: 1,
			},
			featureDeductions: [buildFeatureDeduction("messages")],
			apiVersion: ApiVersion.V2_1,
		});

		expect(mockState.runRedisTrackV3Calls).toHaveLength(1);
		expect(mockState.runRedisTrackV3Calls[0]?.idempotencyKey).toBe(
			"track:req_123",
		);
	});

	test("reloads once and retries a changed subject view with the same idempotency key", async () => {
		mockState.fullSubjectReads = [fullSubject, replacementFullSubject];
		mockState.runRedisTrackV3Errors = [subjectViewChangedError()];

		await runTrackV3({
			ctx,
			body: {
				customer_id: "cus_123",
				event_name: "message.sent",
				idempotency_key: "idem_123",
				value: 1,
			},
			featureDeductions: [
				buildFeatureDeduction("messages"),
				buildFeatureDeduction("credits"),
			],
			apiVersion: ApiVersion.V2_1,
		});

		expect(mockState.getOrSetCachedFullSubjectCalls).toHaveLength(2);
		expect(mockState.runRedisTrackV3Calls).toHaveLength(2);
		expect(mockState.runRedisTrackV3Calls[0]?.fullSubject).toBe(fullSubject);
		expect(mockState.runRedisTrackV3Calls[1]?.fullSubject).toBe(
			replacementFullSubject,
		);
		expect(
			mockState.runRedisTrackV3Calls.map((call) => call.idempotencyKey),
		).toEqual(["track:req_123", "track:req_123"]);
	});

	test("surfaces a second changed subject view without retrying forever", async () => {
		mockState.fullSubjectReads = [fullSubject, replacementFullSubject];
		mockState.runRedisTrackV3Errors = [
			subjectViewChangedError(),
			subjectViewChangedError(),
		];

		await expect(
			runTrackV3({
				ctx,
				body: {
					customer_id: "cus_123",
					feature_id: "messages",
					idempotency_key: "idem_123",
					value: 1,
				},
				featureDeductions: [buildFeatureDeduction("messages")],
				apiVersion: ApiVersion.V2_1,
			}),
		).rejects.toMatchObject({
			code: "SUBJECT_VIEW_CHANGED",
		});

		expect(mockState.getOrSetCachedFullSubjectCalls).toHaveLength(2);
		expect(mockState.runRedisTrackV3Calls).toHaveLength(2);
	});
});

afterAll(() => {
	mock.restore();
});
