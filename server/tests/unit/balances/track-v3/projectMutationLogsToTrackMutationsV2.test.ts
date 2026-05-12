import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type Feature,
	type FullCustomerEntitlement,
	type FullSubject,
	SubjectType,
} from "@autumn/shared";
import { projectMutationLogsToTrackMutationsV2 } from "@/internal/balances/utils/deductionV2/projectMutationLogsToTrackMutationsV2.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";

const buildFeature = (id: string): Feature =>
	({
		id,
		internal_id: `feat_${id}`,
		org_id: "org_1",
		env: AppEnv.Live,
		name: id,
		type: "metered",
		config: null,
		display: null,
		created_at: 1,
		archived: false,
		event_names: [],
	}) as Feature;

const buildCustomerEntitlement = ({
	id,
	feature,
	rolloverIds = [],
}: {
	id: string;
	feature: Feature;
	rolloverIds?: string[];
}): FullCustomerEntitlement =>
	({
		id,
		internal_customer_id: "cus_int_1",
		internal_entity_id: null,
		internal_feature_id: feature.internal_id,
		customer_id: "cus_1",
		feature_id: feature.id,
		customer_product_id: null,
		entitlement_id: `ent_${id}`,
		created_at: 1,
		unlimited: false,
		balance: 10,
		additional_balance: 0,
		usage_allowed: true,
		next_reset_at: null,
		adjustment: 0,
		expires_at: null,
		cache_version: 0,
		entities: null,
		external_id: null,
		entitlement: {
			id: `ent_${id}`,
			internal_product_id: "prod_1",
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
			org_id: "org_1",
			rollover: null,
			feature,
		},
		replaceables: [],
		rollovers: rolloverIds.map((rolloverId) => ({
			id: rolloverId,
			cus_ent_id: id,
			balance: 5,
			usage: 0,
			expires_at: null,
			entities: null,
		})),
	}) as unknown as FullCustomerEntitlement;

const buildFullSubject = ({
	customerEntitlements,
}: {
	customerEntitlements: FullCustomerEntitlement[];
}): FullSubject =>
	({
		subjectType: SubjectType.Customer,
		customerId: "cus_1",
		internalCustomerId: "cus_int_1",
		entityId: undefined,
		internalEntityId: undefined,
		customer: {
			id: "cus_1",
			internal_id: "cus_int_1",
			org_id: "org_1",
			env: AppEnv.Live,
			created_at: 1,
		},
		entity: undefined,
		customer_products: [],
		extra_customer_entitlements: customerEntitlements,
		subscriptions: [],
		invoices: [],
		aggregated_customer_products: undefined,
		aggregated_customer_entitlements: undefined,
	}) as unknown as FullSubject;

const buildLog = (overrides: Partial<MutationLogItem>): MutationLogItem => ({
	target_type: "customer_entitlement",
	customer_entitlement_id: null,
	rollover_id: null,
	entity_id: null,
	credit_cost: 0,
	balance_delta: 0,
	adjustment_delta: 0,
	usage_delta: 0,
	value_delta: 0,
	...overrides,
});

describe("projectMutationLogsToTrackMutationsV2", () => {
	test("returns an empty array when there are no logs", () => {
		const fullSubject = buildFullSubject({ customerEntitlements: [] });

		expect(
			projectMutationLogsToTrackMutationsV2({ fullSubject, mutationLogs: [] }),
		).toEqual([]);
	});

	test("flips balance_delta sign so consumption is positive", () => {
		const feature = buildFeature("messages");
		const fullSubject = buildFullSubject({
			customerEntitlements: [
				buildCustomerEntitlement({ id: "cus_ent_messages", feature }),
			],
		});

		const result = projectMutationLogsToTrackMutationsV2({
			fullSubject,
			mutationLogs: [
				buildLog({
					target_type: "customer_entitlement",
					customer_entitlement_id: "cus_ent_messages",
					balance_delta: -4,
				}),
			],
		});

		expect(result).toEqual([
			{
				balance_id: "cus_ent_messages",
				feature_id: "messages",
				value: 4,
			},
		]);
	});

	test("emits negative value when a track refunds balance (positive balance_delta)", () => {
		const feature = buildFeature("messages");
		const fullSubject = buildFullSubject({
			customerEntitlements: [
				buildCustomerEntitlement({ id: "cus_ent_messages", feature }),
			],
		});

		const result = projectMutationLogsToTrackMutationsV2({
			fullSubject,
			mutationLogs: [
				buildLog({
					target_type: "customer_entitlement",
					customer_entitlement_id: "cus_ent_messages",
					balance_delta: 3,
				}),
			],
		});

		expect(result).toHaveLength(1);
		expect(result[0].value).toBe(-3);
	});

	test("aggregates multiple logs against the same balance into one mutation", () => {
		const feature = buildFeature("messages");
		const fullSubject = buildFullSubject({
			customerEntitlements: [
				buildCustomerEntitlement({ id: "cus_ent_messages", feature }),
			],
		});

		const result = projectMutationLogsToTrackMutationsV2({
			fullSubject,
			mutationLogs: [
				buildLog({
					target_type: "customer_entitlement",
					customer_entitlement_id: "cus_ent_messages",
					balance_delta: -2,
				}),
				buildLog({
					target_type: "customer_entitlement",
					customer_entitlement_id: "cus_ent_messages",
					balance_delta: -5,
				}),
			],
		});

		expect(result).toHaveLength(1);
		expect(result[0].value).toBe(7);
	});

	test("emits a separate mutation for each touched balance across credit-system features", () => {
		const messages = buildFeature("messages");
		const aiCredits = buildFeature("ai_credits");
		const fullSubject = buildFullSubject({
			customerEntitlements: [
				buildCustomerEntitlement({ id: "cus_ent_messages", feature: messages }),
				buildCustomerEntitlement({
					id: "cus_ent_ai_credits",
					feature: aiCredits,
				}),
			],
		});

		const result = projectMutationLogsToTrackMutationsV2({
			fullSubject,
			mutationLogs: [
				buildLog({
					target_type: "customer_entitlement",
					customer_entitlement_id: "cus_ent_messages",
					balance_delta: -1,
				}),
				buildLog({
					target_type: "customer_entitlement",
					customer_entitlement_id: "cus_ent_ai_credits",
					balance_delta: -7,
				}),
			],
		});

		expect(result).toHaveLength(2);
		expect(result).toContainEqual({
			balance_id: "cus_ent_messages",
			feature_id: "messages",
			value: 1,
		});
		expect(result).toContainEqual({
			balance_id: "cus_ent_ai_credits",
			feature_id: "ai_credits",
			value: 7,
		});
	});

	test("surfaces rollover mutations with the parent feature_id", () => {
		const feature = buildFeature("messages");
		const fullSubject = buildFullSubject({
			customerEntitlements: [
				buildCustomerEntitlement({
					id: "cus_ent_messages",
					feature,
					rolloverIds: ["roll_1"],
				}),
			],
		});

		const result = projectMutationLogsToTrackMutationsV2({
			fullSubject,
			mutationLogs: [
				buildLog({
					target_type: "rollover",
					rollover_id: "roll_1",
					balance_delta: -2,
				}),
			],
		});

		expect(result).toEqual([
			{
				balance_id: "roll_1",
				feature_id: "messages",
				value: 2,
			},
		]);
	});

	test("filters out grant-only adjustments (balance_delta === 0)", () => {
		const feature = buildFeature("messages");
		const fullSubject = buildFullSubject({
			customerEntitlements: [
				buildCustomerEntitlement({ id: "cus_ent_messages", feature }),
			],
		});

		const result = projectMutationLogsToTrackMutationsV2({
			fullSubject,
			mutationLogs: [
				buildLog({
					target_type: "customer_entitlement",
					customer_entitlement_id: "cus_ent_messages",
					balance_delta: 0,
					adjustment_delta: 5,
				}),
			],
		});

		expect(result).toEqual([]);
	});

	test("skips logs whose balance row is not in the full subject", () => {
		const feature = buildFeature("messages");
		const fullSubject = buildFullSubject({
			customerEntitlements: [
				buildCustomerEntitlement({ id: "cus_ent_messages", feature }),
			],
		});

		const result = projectMutationLogsToTrackMutationsV2({
			fullSubject,
			mutationLogs: [
				buildLog({
					target_type: "customer_entitlement",
					customer_entitlement_id: "cus_ent_unknown",
					balance_delta: -3,
				}),
			],
		});

		expect(result).toEqual([]);
	});

	test("collapses per-entity logs against the same balance into one mutation (entity scope not exposed)", () => {
		const feature = buildFeature("messages");
		const fullSubject = buildFullSubject({
			customerEntitlements: [
				buildCustomerEntitlement({ id: "cus_ent_messages", feature }),
			],
		});

		const result = projectMutationLogsToTrackMutationsV2({
			fullSubject,
			mutationLogs: [
				buildLog({
					target_type: "customer_entitlement",
					customer_entitlement_id: "cus_ent_messages",
					entity_id: "entity_a",
					balance_delta: -2,
				}),
				buildLog({
					target_type: "customer_entitlement",
					customer_entitlement_id: "cus_ent_messages",
					entity_id: "entity_b",
					balance_delta: -3,
				}),
			],
		});

		expect(result).toEqual([
			{
				balance_id: "cus_ent_messages",
				feature_id: "messages",
				value: 5,
			},
		]);
	});
});
