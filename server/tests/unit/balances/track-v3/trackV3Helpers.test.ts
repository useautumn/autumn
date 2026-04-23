import { describe, expect, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type EntityBalance,
	type Feature,
	type FullCustomerEntitlement,
	type FullSubject,
	type Organization,
	SubjectType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	applyDeductionUpdateToFullSubject,
	applyRolloverUpdatesToFullSubject,
	deductionToTrackResponseV2,
} from "@/internal/balances/utils/deductionV2/index.js";
import type { DeductionUpdate } from "@/internal/balances/utils/types/deductionUpdate.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import type { RolloverUpdate } from "@/internal/balances/utils/types/rolloverUpdate.js";

const baseFeature: Feature = {
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

const buildExtraCustomerEntitlement = ({
	balance,
	adjustment = 0,
	entities = null,
}: {
	balance: number;
	adjustment?: number;
	entities?: Record<string, EntityBalance> | null;
}): FullCustomerEntitlement =>
	({
		id: "cus_ent_messages",
		internal_customer_id: "cus_int_1",
		internal_entity_id: null,
		internal_feature_id: "feat_messages",
		customer_id: "cus_1",
		feature_id: "messages",
		customer_product_id: null,
		entitlement_id: "ent_messages",
		created_at: 1,
		unlimited: false,
		balance,
		additional_balance: 0,
		usage_allowed: true,
		next_reset_at: null,
		adjustment,
		expires_at: null,
		cache_version: 0,
		entities,
		external_id: null,
		entitlement: {
			id: "ent_messages",
			internal_product_id: "prod_1",
			internal_feature_id: "feat_messages",
			feature_id: "messages",
			allowance_type: "fixed",
			allowance: 10,
			interval: "month",
			interval_count: 1,
			usage_limit: null,
			carry_from_previous: false,
			created_at: 1,
			entity_feature_id: entities ? "entity_feature" : null,
			is_custom: false,
			org_id: "org_1",
			rollover: null,
			feature: baseFeature,
		},
		replaceables: [],
		rollovers: [
			{
				id: "roll_1",
				cus_ent_id: "cus_ent_messages",
				balance: 3,
				usage: 1,
				expires_at: null,
				entities: entities
					? {
							entity_1: {
								id: "entity_1",
								balance: 3,
								usage: 1,
							},
						}
					: null,
			},
		],
	}) as FullCustomerEntitlement;

const buildFullSubject = ({
	subjectType,
	balance,
	entities = null,
}: {
	subjectType: "customer" | "entity";
	balance: number;
	entities?: Record<string, EntityBalance> | null;
}): FullSubject =>
	({
		subjectType:
			subjectType === "entity" ? SubjectType.Entity : SubjectType.Customer,
		customerId: "cus_1",
		internalCustomerId: "cus_int_1",
		entityId: subjectType === "entity" ? "entity_1" : undefined,
		internalEntityId: subjectType === "entity" ? "entity_int_1" : undefined,
		customer: {
			id: "cus_1",
			internal_id: "cus_int_1",
			org_id: "org_1",
			env: AppEnv.Live,
			created_at: 1,
			name: "Customer",
			email: "customer@example.com",
			fingerprint: null,
			processor: null,
			processors: {},
			metadata: {},
			send_email_receipts: false,
			auto_topups: null,
			spend_limits: null,
			usage_alerts: null,
			overage_allowed: null,
		},
		entity:
			subjectType === "entity"
				? {
						id: "entity_1",
						internal_id: "entity_int_1",
						internal_customer_id: "cus_int_1",
						org_id: "org_1",
						env: AppEnv.Live,
						created_at: 1,
						name: "Entity",
						deleted: false,
						internal_feature_id: "feat_entity",
						feature_id: "entity_feature",
						spend_limits: null,
						usage_alerts: null,
						overage_allowed: null,
					}
				: undefined,
		customer_products: [],
		extra_customer_entitlements: [
			buildExtraCustomerEntitlement({
				balance,
				entities,
			}),
		],
		subscriptions: [],
		invoices: [],
		aggregated_customer_products: undefined,
		aggregated_customer_entitlements: undefined,
	}) as FullSubject;

const buildCtx = (): AutumnContext =>
	({
		org: {
			id: "org_1",
			config: {},
		} as Organization,
		env: AppEnv.Live,
		features: [baseFeature],
		db: {} as never,
		dbGeneral: {} as never,
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
			debug: () => {},
		} as never,
		id: "req_1",
		isPublic: false,
		authType: "secret_key",
		apiVersion: new ApiVersionClass(ApiVersion.V1_2),
		timestamp: Date.now(),
		expand: [],
		skipCache: false,
		extraLogs: {},
		redisV2: {} as never,
	}) as unknown as AutumnContext;

const buildFeatureDeduction = (): FeatureDeduction =>
	({
		feature: baseFeature,
		deduction: 4,
	}) as FeatureDeduction;

describe("track v3 helpers", () => {
	test("applyDeductionUpdateToFullSubject updates extra customer entitlements", () => {
		const fullSubject = buildFullSubject({
			subjectType: "customer",
			balance: 10,
		});
		const update: DeductionUpdate = {
			balance: 6,
			additional_balance: 0,
			entities: {},
			adjustment: 2,
			deducted: 4,
		};

		applyDeductionUpdateToFullSubject({
			fullSubject,
			customerEntitlementId: "cus_ent_messages",
			update,
		});

		expect(fullSubject.extra_customer_entitlements[0].balance).toBe(6);
		expect(fullSubject.extra_customer_entitlements[0].adjustment).toBe(2);
	});

	test("applyRolloverUpdatesToFullSubject updates nested rollovers", () => {
		const fullSubject = buildFullSubject({
			subjectType: "customer",
			balance: 10,
		});
		const rolloverUpdates: Record<string, RolloverUpdate> = {
			roll_1: {
				balance: 1,
				usage: 3,
				entities: {},
			},
		};

		applyRolloverUpdatesToFullSubject({
			fullSubject,
			rolloverUpdates,
		});

		expect(
			fullSubject.extra_customer_entitlements[0].rollovers[0].balance,
		).toBe(1);
		expect(fullSubject.extra_customer_entitlements[0].rollovers[0].usage).toBe(
			3,
		);
	});

	test("deductionToTrackResponseV2 builds customer-subject balances", async () => {
		const ctx = buildCtx();
		const fullSubject = buildFullSubject({
			subjectType: "customer",
			balance: 6,
		});
		const response = await deductionToTrackResponseV2({
			ctx,
			fullSubject,
			featureDeductions: [buildFeatureDeduction()],
			updates: {
				cus_ent_messages: {
					balance: 6,
					additional_balance: 0,
					entities: {},
					adjustment: 0,
					deducted: 4,
				},
			},
		});

		expect(response.balance?.feature_id).toBe("messages");
		expect(response.balance?.remaining).toBe(6);
	});

	test("deductionToTrackResponseV2 builds entity-subject balances", async () => {
		const ctx = buildCtx();
		const fullSubject = buildFullSubject({
			subjectType: "entity",
			balance: 0,
			entities: {
				entity_1: {
					id: "entity_1",
					balance: 7,
					adjustment: 0,
				},
			},
		});
		const response = await deductionToTrackResponseV2({
			ctx,
			fullSubject,
			featureDeductions: [buildFeatureDeduction()],
			updates: {
				cus_ent_messages: {
					balance: 0,
					additional_balance: 0,
					entities: {
						entity_1: {
							id: "entity_1",
							balance: 7,
							adjustment: 0,
						},
					},
					adjustment: 0,
					deducted: 3,
				},
			},
		});

		expect(response.balance?.feature_id).toBe("messages");
		expect(response.balance?.remaining).toBe(7);
	});
});
