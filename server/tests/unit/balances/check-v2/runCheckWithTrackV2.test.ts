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
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckDataV2 } from "@/internal/balances/check/checkTypes/CheckDataV2.js";
import { runCheckWithTrackV2 } from "@/internal/balances/check/runCheckWithTrackV2.js";

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
			}),
		).rejects.toMatchObject({
			message:
				"Can't pass in 'send_event: true' when using publishable key for Autumn",
		});
	});

	test("rejects boolean features", async () => {
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
			}),
		).rejects.toMatchObject({
			code: ErrCode.InvalidRequest,
			message: "Not allowed to pass in send_event: true for a boolean feature",
		});
	});

	test("rejects locks for allocated features", async () => {
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
			}),
		).rejects.toMatchObject({
			code: ErrCode.InvalidRequest,
			message: "Lock is not supported for allocated features",
		});
	});
});
