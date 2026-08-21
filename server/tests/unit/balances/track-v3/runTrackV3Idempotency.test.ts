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
	getOrSetCachedPartialFullSubjectCalls: [] as Record<string, unknown>[],
	runRedisTrackV3Calls: [] as Record<string, unknown>[],
	runRedisTrackV3Errors: [] as Error[],
	refreshSubjectViewOnNextRun: false,
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
	"@/internal/customers/cache/fullSubject/actions/partial/getOrSetCachedPartialFullSubject.js",
	() => ({
		getOrSetCachedPartialFullSubject: async (args: Record<string, unknown>) => {
			mockState.getOrSetCachedPartialFullSubjectCalls.push(args);
			return mockState.fullSubjectReads.shift() ?? fullSubject;
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/partial/getOrCreateCachedPartialFullSubject.js",
	() => ({
		getOrCreateCachedPartialFullSubject: async () => fullSubject,
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
			if (mockState.refreshSubjectViewOnNextRun) {
				mockState.refreshSubjectViewOnNextRun = false;
				await (args.refreshFullSubject as () => Promise<FullSubject>)();
			}
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
	features: [{ id: "messages" }, { id: "credits" }],
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
		mockState.getOrSetCachedPartialFullSubjectCalls = [];
		mockState.runRedisTrackV3Calls = [];
		mockState.runRedisTrackV3Errors = [];
		mockState.refreshSubjectViewOnNextRun = false;
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
		expect(
			mockState.getOrSetCachedPartialFullSubjectCalls[0]?.featureIds,
		).toEqual(["messages", "credits"]);
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

	test("lets the Redis deduction refresh the subject once without restarting the track", async () => {
		mockState.fullSubjectReads = [fullSubject, replacementFullSubject];
		mockState.refreshSubjectViewOnNextRun = true;

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

		expect(mockState.getOrSetCachedPartialFullSubjectCalls).toHaveLength(2);
		expect(mockState.runRedisTrackV3Calls).toHaveLength(1);
		expect(mockState.runRedisTrackV3Calls[0]?.fullSubject).toBe(fullSubject);
		expect(mockState.runRedisTrackV3Calls[0]?.idempotencyKey).toBe(
			"track:req_123",
		);
	});

	test("does not restart the whole track when the bounded refresh is exhausted", async () => {
		mockState.fullSubjectReads = [fullSubject];
		mockState.runRedisTrackV3Errors = [subjectViewChangedError()];

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

		expect(mockState.getOrSetCachedPartialFullSubjectCalls).toHaveLength(1);
		expect(mockState.runRedisTrackV3Calls).toHaveLength(1);
	});
});

afterAll(() => {
	mock.restore();
});
