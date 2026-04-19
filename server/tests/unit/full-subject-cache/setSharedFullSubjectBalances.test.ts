import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type NormalizedFullSubject,
	SubjectType,
} from "@autumn/shared";
import { buildSharedBalanceWrites } from "@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setSharedFullSubjectBalances.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";

const buildNormalized = (): NormalizedFullSubject =>
	({
		subjectType: SubjectType.Customer,
		customerId: "cus_1",
		internalCustomerId: "cus_int_1",
		customer: {
			id: "cus_1",
			internal_id: "cus_int_1",
			org_id: "org_1",
			env: AppEnv.Live,
			created_at: 1,
			name: "Test Customer",
			email: "test@example.com",
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
		entity: undefined,
		customer_products: [],
		customer_entitlements: [
			{
				id: "cus_ent_1",
				internal_customer_id: "cus_int_1",
				internal_entity_id: null,
				internal_feature_id: "feat_int_messages",
				feature_id: "messages",
				customer_product_id: null,
				entitlement_id: "ent_1",
				created_at: 1,
				unlimited: false,
				balance: 10,
				adjustment: 0,
				additional_balance: 0,
				usage_allowed: true,
				next_reset_at: null,
				expires_at: null,
				external_id: null,
				entities: null,
				cache_version: 0,
				customer_id: "cus_1",
				entitlement: {
					id: "ent_1",
					internal_product_id: "prod_int_1",
					internal_feature_id: "feat_int_messages",
					feature_id: "messages",
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
					feature: {
						id: "messages",
						internal_id: "feat_int_messages",
						org_id: "org_1",
						env: AppEnv.Live,
						name: "Messages",
						type: "metered",
						config: null,
						display: null,
						created_at: 1,
						archived: false,
						event_names: [],
					},
				},
				rollovers: [],
				replaceables: [],
				customerPrice: null,
				customerProductOptions: null,
				customerProductQuantity: 1,
				isEntityLevel: false,
			},
		],
		customer_prices: [],
		flags: {},
		products: [],
		entitlements: [],
		prices: [],
		free_trials: [],
		subscriptions: [],
		invoices: [],
		entity_aggregations: undefined,
	}) as NormalizedFullSubject;

describe("setSharedFullSubjectBalances", () => {
	test("builds shared balance writes without meta-key writes", () => {
		const normalized = buildNormalized();

		const writes = buildSharedBalanceWrites({
			orgId: "org_1",
			env: AppEnv.Live,
			customerId: "cus_1",
			customerEntitlements: normalized.customer_entitlements,
			aggregatedCustomerEntitlements: [],
		});

		expect(writes).toHaveLength(1);
		expect(writes[0].balanceKey).toBe(
			buildSharedFullSubjectBalanceKey({
				orgId: "org_1",
				env: AppEnv.Live,
				customerId: "cus_1",
				featureId: "messages",
			}),
		);
		expect(writes[0].fields).toEqual({
			cus_ent_1: JSON.stringify(normalized.customer_entitlements[0]),
		});
	});
});
