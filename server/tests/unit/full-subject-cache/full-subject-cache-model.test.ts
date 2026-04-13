import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type NormalizedFullSubject,
	SubjectType,
} from "@autumn/shared";
import {
	cachedFullSubjectToNormalized,
	normalizedToCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";

const buildNormalized = (): NormalizedFullSubject =>
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
			name: "Test",
			email: "test@example.com",
			fingerprint: null,
			processor: null,
			processors: {},
			metadata: { team: "growth" },
			send_email_receipts: true,
			auto_topups: null,
			spend_limits: null,
			usage_alerts: null,
			overage_allowed: null,
		},
		entity: undefined,
		customer_products: [],
		customer_entitlements: [
			{
				id: "cus_ent_1",
				internal_customer_id: "cus_int_1",
				internal_entity_id: null,
				internal_feature_id: "feat_int_1",
				customer_id: "cus_1",
				feature_id: "feat_1",
				customer_product_id: "cp_1",
				entitlement_id: "ent_1",
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
					id: "ent_1",
					internal_product_id: "prod_int_1",
					internal_feature_id: "feat_int_1",
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
					feature_id: "feat_1",
					rollover: null,
					feature: {
						id: "feat_1",
						internal_id: "feat_int_1",
						org_id: "org_1",
						env: AppEnv.Live,
						name: "Feature 1",
						type: "metered",
						config: null,
						display: null,
						created_at: 1,
						archived: false,
						event_names: [],
					},
				},
				rollovers: [],
				customerPrice: null,
				customerProductOptions: [],
				customerProductQuantity: 1,
			},
		],
		customer_prices: [],
		flags: [],
		products: [],
		entitlements: [],
		prices: [],
		free_trials: [],
		subscriptions: [],
		invoices: [],
		entity_aggregations: undefined,
	}) as unknown as NormalizedFullSubject;

describe("fullSubject cache model", () => {
	test("stores non-balance data in the top-level subject", () => {
		const normalized = buildNormalized();
		const cached = normalizedToCachedFullSubject({ normalized });

		expect(cached.customer_products).toEqual(normalized.customer_products);
		expect(cached.meteredFeatures).toEqual(["feat_1"]);
		expect(cached._cachedAt).toBeTypeOf("number");
	});

	test("stores customer entity epoch for entity subjects", () => {
		const normalized = {
			...buildNormalized(),
			subjectType: SubjectType.Entity,
			entityId: "ent_1",
			internalEntityId: "ent_int_1",
			entity: {
				id: "ent_1",
				internal_id: "ent_int_1",
				internal_customer_id: "cus_int_1",
				org_id: "org_1",
				env: AppEnv.Live,
				created_at: 1,
				name: "Entity",
				deleted: false,
				internal_feature_id: "feat_int_entity",
				feature_id: "feature_entity",
				spend_limits: null,
				usage_alerts: null,
				overage_allowed: null,
			},
		} as NormalizedFullSubject;
		const cached = normalizedToCachedFullSubject({
			normalized,
			customerEntityEpoch: 7,
		});

		expect(cached.customerEntityEpoch).toBe(7);
	});

	test("reconstructs normalized data from cached subject and balances", () => {
		const normalized = buildNormalized();
		const cached = normalizedToCachedFullSubject({ normalized });
		const reconstructed = cachedFullSubjectToNormalized({
			cached,
			customerEntitlements: normalized.customer_entitlements,
		});

		expect(reconstructed.customer).toEqual(normalized.customer);
		expect(reconstructed.customer_products).toEqual(
			normalized.customer_products,
		);
		expect(reconstructed.customer_entitlements).toEqual(
			normalized.customer_entitlements,
		);
		expect(reconstructed.customer_prices).toEqual([]);
	});
});
