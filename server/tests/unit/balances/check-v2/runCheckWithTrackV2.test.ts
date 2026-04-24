import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	ErrCode,
	type Feature,
	FeatureUsageType,
	type FullSubject,
	type Organization,
	SubjectType,
} from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckDataV2 } from "@/internal/balances/check/checkTypes/CheckDataV2.js";
import { runCheckWithTrackV2 } from "@/internal/balances/check/runCheckWithTrackV2.js";

const mockState = {
	runTrackV3Calls: [] as unknown[],
	triggerExpireLockReceiptCalls: [] as unknown[],
	runTrackV3Error: null as unknown,
};

const deps = {
	runTrackV3: async (args: unknown) => {
		mockState.runTrackV3Calls.push(args);
		if (mockState.runTrackV3Error) throw mockState.runTrackV3Error;
		return { balance: 10 } as never;
	},
	workflows: {
		triggerExpireLockReceipt: async (...args: unknown[]) => {
			mockState.triggerExpireLockReceiptCalls.push(args);
		},
	},
};

const meteredFeature = {
	id: "messages",
	internal_id: "feat_messages",
	org_id: "org_1",
	env: AppEnv.Live,
	name: "Messages",
	type: "metered",
	config: null,
	display: null,
	created_at: 1,
	archived: false,
	event_names: [],
} as Feature;

const buildCtx = ({ isPublic = false }: { isPublic?: boolean } = {}) =>
	({
		org: {
			id: "org_1",
			config: {},
		} as Organization,
		env: AppEnv.Live,
		isPublic,
		logger: {
			error: () => {},
			info: () => {},
			warn: () => {},
			debug: () => {},
		},
		features: [meteredFeature],
	}) as AutumnContext;

const buildCheckData = ({
	originalFeature = meteredFeature,
	featureToUse = meteredFeature,
}: {
	originalFeature?: Feature;
	featureToUse?: Feature;
} = {}) =>
	({
		customerId: "cus_1",
		entityId: undefined,
		apiBalance: undefined,
		apiFlag: undefined,
		apiSubject: {},
		originalFeature,
		featureToUse,
		fullSubject: {
			subjectType: SubjectType.Customer,
			customerId: "cus_1",
			internalCustomerId: "cus_int_1",
			customer: {
				id: "cus_1",
				internal_id: "cus_int_1",
			},
			customer_products: [],
			extra_customer_entitlements: [],
			subscriptions: [],
			invoices: [],
		} as unknown as FullSubject,
		evaluationApiSubject: {},
		evaluationApiBalance: undefined,
		evaluationApiFlag: undefined,
	}) as CheckDataV2;

describe("runCheckWithTrackV2", () => {
	test("rejects send_event for public requests", async () => {
		mockState.runTrackV3Calls = [];
		mockState.triggerExpireLockReceiptCalls = [];
		mockState.runTrackV3Error = null;

		await expect(
			runCheckWithTrackV2({
				ctx: buildCtx({ isPublic: true }),
				body: {
					customer_id: "cus_1",
					feature_id: "messages",
					send_event: true,
				} as never,
				requiredBalance: 1,
				checkData: buildCheckData(),
				deps,
			}),
		).rejects.toMatchObject({
			message:
				"Can't pass in 'send_event: true' when using publishable key for Autumn",
		});
	});

	test("rejects boolean features", async () => {
		mockState.runTrackV3Calls = [];
		mockState.triggerExpireLockReceiptCalls = [];
		mockState.runTrackV3Error = null;

		await expect(
			runCheckWithTrackV2({
				ctx: buildCtx(),
				body: {
					customer_id: "cus_1",
					feature_id: "messages",
					send_event: true,
				} as never,
				requiredBalance: 1,
				checkData: buildCheckData({
					originalFeature: {
						...meteredFeature,
						type: "boolean",
					} as Feature,
				}),
				deps,
			}),
		).rejects.toMatchObject({
			code: ErrCode.InvalidRequest,
			message: "Not allowed to pass in send_event: true for a boolean feature",
		});
	});

	test("rejects locks for allocated features", async () => {
		mockState.runTrackV3Calls = [];
		mockState.triggerExpireLockReceiptCalls = [];
		mockState.runTrackV3Error = null;

		await expect(
			runCheckWithTrackV2({
				ctx: buildCtx(),
				body: {
					customer_id: "cus_1",
					feature_id: "messages",
					lock: {
						enabled: true,
					},
				} as never,
				requiredBalance: 1,
				checkData: buildCheckData({
					featureToUse: {
						...meteredFeature,
						config: {
							usage_type: FeatureUsageType.Continuous,
						},
					} as Feature,
				}),
				deps,
			}),
		).rejects.toMatchObject({
			code: ErrCode.InvalidRequest,
			message: "Lock is not supported for allocated features",
		});
	});

	test("rethrows RedisUnavailableError from runTrackV3 before scheduling lock expiry", async () => {
		mockState.runTrackV3Calls = [];
		mockState.triggerExpireLockReceiptCalls = [];
		mockState.runTrackV3Error = new RedisUnavailableError({
			source: "runTrackV3",
			reason: "timeout",
		});

		await expect(
			runCheckWithTrackV2({
				ctx: buildCtx(),
				body: {
					customer_id: "cus_1",
					feature_id: "messages",
					send_event: true,
					lock: {
						enabled: true,
						lock_id: "lock_1",
						hashed_key: "hash_1",
						expires_at: new Date().toISOString(),
					},
				} as never,
				requiredBalance: 1,
				checkData: buildCheckData(),
				deps,
			}),
		).rejects.toBe(mockState.runTrackV3Error);

		expect(mockState.runTrackV3Calls).toHaveLength(1);
		expect(mockState.triggerExpireLockReceiptCalls).toHaveLength(0);
	});
});
