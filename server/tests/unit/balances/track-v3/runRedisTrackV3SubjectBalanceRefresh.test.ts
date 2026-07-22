/**
 * Regression coverage for a FullSubject cache hit whose shared balance field
 * is deleted before the Redis deduction runs.
 *
 * Red failure mode:
 * - SUBJECT_BALANCE_NOT_FOUND falls back to Postgres with the stale subject;
 * - retrying a multi-feature operation can double-apply a feature whose earlier
 *   Lua call already succeeded.
 *
 * Green success criteria:
 * - a single-feature track refreshes through the serialized FullSubject cache
 *   path and retries Redis once;
 * - a repeated single-feature miss fails without a Postgres/cache split; and
 * - a multi-feature miss refreshes inside the Redis deduction, preserving
 *   earlier feature progress while retrying only the missing feature.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "@/internal/balances/utils/types/redisDeductionError.js";

const buildFullSubject = (label: string) =>
	({
		label,
		customerId: "customer_1",
		internalCustomerId: "internal_customer_1",
		customer: {},
		customer_products: [],
		extra_customer_entitlements: [],
		invoices: [],
		subjectType: "customer",
	}) as unknown as FullSubject;

const subjectBalanceNotFound = () =>
	new RedisDeductionError({
		message: "subject balance field disappeared",
		code: RedisDeductionErrorCode.SubjectBalanceNotFound,
	});

const successfulRedisResult = (fullSubject: FullSubject) => ({
	updates: {},
	fullSubject,
	rolloverUpdates: {},
	modifiedCusEntIdsByFeatureId: {},
	mutationLogs: [],
	usageWindowUpdates: [],
});

const mockState = {
	redisOutcomes: [] as Array<Error | ReturnType<typeof successfulRedisResult>>,
	redisSubjects: [] as FullSubject[],
	cacheRefreshCalls: 0,
	cacheRefreshSubject: buildFullSubject("cache-refresh"),
	cacheVerificationCalls: 0,
	verifiedCacheSubject: buildFullSubject("cache-refresh") as
		| FullSubject
		| undefined,
};

mock.module("@/internal/balances/utils/deductionV2/index.js", () => ({
	executePostgresDeductionV2: async () => {
		throw new Error("Unexpected Postgres deduction fallback");
	},
	executeRedisDeductionV2: async ({
		fullSubject,
		onSubjectBalanceNotFound,
	}: {
		fullSubject: FullSubject;
		onSubjectBalanceNotFound?: () => Promise<FullSubject>;
	}) => {
		mockState.redisSubjects.push(fullSubject);
		const outcome = mockState.redisOutcomes.shift();
		if (!outcome) throw new Error("Missing mocked Redis outcome");
		if (outcome instanceof Error) {
			if (
				outcome instanceof RedisDeductionError &&
				outcome.code === RedisDeductionErrorCode.SubjectBalanceNotFound &&
				onSubjectBalanceNotFound
			) {
				const refreshedSubject = await onSubjectBalanceNotFound();
				mockState.redisSubjects.push(refreshedSubject);
				const resumedOutcome = mockState.redisOutcomes.shift();
				if (!resumedOutcome) throw new Error("Missing mocked resume outcome");
				if (resumedOutcome instanceof Error) throw resumedOutcome;
				return resumedOutcome;
			}
			throw outcome;
		}
		return outcome;
	},
	deductionToTrackResponseV2: async () => ({ balance: 400, balances: null }),
	projectMutationLogsToTrackDeductionsV2: () => [],
}));

mock.module(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({
		getOrSetCachedFullSubject: async () => {
			mockState.cacheRefreshCalls += 1;
			return mockState.cacheRefreshSubject;
		},
	}),
);

mock.module(
	"@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js",
	() => ({
		getCachedFullSubject: async () => {
			mockState.cacheVerificationCalls += 1;
			return {
				fullSubject: mockState.verifiedCacheSubject,
				subjectViewEpoch: 1,
			};
		},
	}),
);

const { runRedisTrackV3 } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/balances/track/v3/runRedisTrackV3.js?subjectBalanceRefresh"
);

const warnings: string[] = [];
const ctx = {
	logger: {
		warn: (message: string) => warnings.push(message),
	},
} as unknown as AutumnContext;

const buildDeduction = (featureId: string) =>
	({ feature: { id: featureId }, deduction: 1 }) as FeatureDeduction;

const staleFullSubject = buildFullSubject("stale-cache-hit");

describe("runRedisTrackV3 missing subject balance refresh", () => {
	beforeEach(() => {
		mockState.redisOutcomes = [];
		mockState.redisSubjects = [];
		mockState.cacheRefreshCalls = 0;
		mockState.cacheRefreshSubject = buildFullSubject("cache-refresh");
		mockState.cacheVerificationCalls = 0;
		mockState.verifiedCacheSubject = mockState.cacheRefreshSubject;
		warnings.length = 0;
	});

	test("refreshes and retries one single-feature Redis deduction", async () => {
		mockState.redisOutcomes = [
			subjectBalanceNotFound(),
			successfulRedisResult(mockState.cacheRefreshSubject),
		];

		const result = await runRedisTrackV3({
			ctx,
			fullSubject: staleFullSubject,
			featureDeductions: [buildDeduction("messages")],
			overageBehavior: "cap",
			body: {
				customer_id: "customer_1",
				feature_id: "messages",
				value: 1,
				skip_event: true,
			},
			idempotencyKey: "track:req_1",
		});

		expect(result.balance).toBe(400);
		expect(mockState.redisSubjects).toEqual([
			staleFullSubject,
			mockState.cacheRefreshSubject,
		]);
		expect(mockState.cacheRefreshCalls).toBe(1);
		expect(mockState.cacheVerificationCalls).toBe(1);
	});

	test("a repeated single-feature miss fails without Postgres fallback", async () => {
		mockState.redisOutcomes = [
			subjectBalanceNotFound(),
			subjectBalanceNotFound(),
		];

		await expect(
			runRedisTrackV3({
				ctx,
				fullSubject: staleFullSubject,
				featureDeductions: [buildDeduction("messages")],
				overageBehavior: "cap",
				body: {
					customer_id: "customer_1",
					feature_id: "messages",
					value: 1,
					skip_event: true,
				},
				idempotencyKey: "track:req_2",
			}),
		).rejects.toMatchObject({
			code: RedisDeductionErrorCode.SubjectBalanceNotFound,
		});

		expect(mockState.cacheRefreshCalls).toBe(1);
		expect(mockState.cacheVerificationCalls).toBe(1);
		expect(warnings.join("\n")).toContain("without Postgres fallback");
	});

	test("refreshes and resumes a multi-feature miss without Postgres fallback", async () => {
		mockState.redisOutcomes = [
			subjectBalanceNotFound(),
			successfulRedisResult(mockState.cacheRefreshSubject),
		];

		const result = await runRedisTrackV3({
			ctx,
			fullSubject: staleFullSubject,
			featureDeductions: [
				buildDeduction("messages"),
				buildDeduction("credits"),
			],
			overageBehavior: "cap",
			body: {
				customer_id: "customer_1",
				event_name: "message.sent",
				value: 1,
				skip_event: true,
			},
			idempotencyKey: "track:req_3",
		});

		expect(result.balance).toBe(400);
		expect(mockState.redisSubjects).toEqual([
			staleFullSubject,
			mockState.cacheRefreshSubject,
		]);
		expect(mockState.cacheRefreshCalls).toBe(1);
		expect(mockState.cacheVerificationCalls).toBe(1);
		expect(warnings).toHaveLength(0);
	});

	test("does not retry against an unverified cache rebuild", async () => {
		const error = subjectBalanceNotFound();
		mockState.redisOutcomes = [error];
		mockState.verifiedCacheSubject = undefined;

		await expect(
			runRedisTrackV3({
				ctx,
				fullSubject: staleFullSubject,
				featureDeductions: [buildDeduction("messages")],
				overageBehavior: "cap",
				body: {
					customer_id: "customer_1",
					feature_id: "messages",
					value: 1,
					skip_event: true,
				},
				idempotencyKey: "track:req_4",
			}),
		).rejects.toMatchObject({
			code: RedisDeductionErrorCode.SubjectBalanceNotFound,
		});

		expect(mockState.redisSubjects).toEqual([staleFullSubject]);
		expect(mockState.cacheRefreshCalls).toBe(1);
		expect(mockState.cacheVerificationCalls).toBe(1);
	});
});

afterAll(() => {
	mock.restore();
});
