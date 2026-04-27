import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type FullSubject,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";

const mockState = {
	runRedisTrackV3Calls: [] as Record<string, unknown>[],
};

const fullSubject = {
	customerId: "cus_123",
	internalCustomerId: "cus_int_123",
	customer: {} as never,
	customer_products: [],
	extra_customer_entitlements: [],
	invoices: [],
	subjectType: "customer",
} as FullSubject;

mock.module(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({
		getOrSetCachedFullSubject: async () => fullSubject,
	}),
);

mock.module(
	"@/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject.js",
	() => ({
		getOrCreateCachedFullSubject: async () => fullSubject,
	}),
);

mock.module(
	"@/internal/balances/track/v3/trackIdempotencyKey.js",
	() => ({
		getTrackIdempotencyKey: ({
			ctx,
		}: {
			ctx: { id: string };
		}) => `track:${ctx.id}`,
	}),
);

mock.module("@/internal/balances/track/v3/runRedisTrackV3.js", () => ({
	runRedisTrackV3: async (
		args: Record<string, unknown>,
	): Promise<TrackResponseV3> => {
		mockState.runRedisTrackV3Calls.push(args);
		return {
			customer_id: "cus_123",
			value: 1,
			balance: null,
		};
	},
}));

import { runTrackV3 } from "@/internal/balances/track/v3/runTrackV3.js";

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

describe("runTrackV3 idempotency routing", () => {
	beforeEach(() => {
		mockState.runRedisTrackV3Calls = [];
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
		expect(mockState.runRedisTrackV3Calls[0]?.idempotencyKey).toBe("track:req_123");
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
		expect(mockState.runRedisTrackV3Calls[0]?.idempotencyKey).toBe("track:req_123");
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
});
