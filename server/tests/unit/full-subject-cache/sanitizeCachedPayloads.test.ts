import { describe, expect, test } from "bun:test";
import { AppEnv, type SubjectBalance } from "@autumn/shared";
import type { CachedFullSubject } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import { sanitizeCachedFullSubject } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedFullSubject.js";
import { sanitizeCachedSubjectBalance } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedSubjectBalance.js";
import { sanitizeShape } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCacheShapeUtils.js";

describe("sanitizeShape (recursive core)", () => {
	test("should coerce non-array to [] for 'array' rule", () => {
		const result = sanitizeShape({
			value: { items: {} },
			spec: { items: "array" },
		});
		expect(result).toEqual({ items: [] });
	});

	test("should preserve valid arrays", () => {
		const result = sanitizeShape({
			value: { items: [1, 2, 3] },
			spec: { items: "array" },
		});
		expect(result).toEqual({ items: [1, 2, 3] });
	});

	test("should coerce non-object to {} for 'record' rule", () => {
		const result = sanitizeShape({
			value: { flags: [] },
			spec: { flags: "record" },
		});
		expect(result).toEqual({ flags: {} });
	});

	test("should coerce non-object to null for 'nullable_record' rule", () => {
		const result = sanitizeShape({
			value: { entities: [] },
			spec: { entities: "nullable_record" },
		});
		expect(result).toEqual({ entities: null });
	});

	test("should preserve null for 'nullable_record' rule", () => {
		const result = sanitizeShape({
			value: { entities: null },
			spec: { entities: "nullable_record" },
		});
		expect(result).toEqual({ entities: null });
	});

	test("should recurse into nested object specs", () => {
		const result = sanitizeShape({
			value: { feature: { event_names: {} } },
			spec: { feature: { event_names: "array" } },
		});
		expect(result).toEqual({ feature: { event_names: [] } });
	});

	test("should handle { items: spec } for array-of-objects", () => {
		const result = sanitizeShape({
			value: { rollovers: [{}, { entities: "bad" }] },
			spec: { rollovers: { items: { entities: "record" } } },
		});
		expect(result).toEqual({
			rollovers: [{ entities: {} }, { entities: {} }],
		});
	});

	test("should coerce then recurse for { items: spec } when field is not an array", () => {
		const result = sanitizeShape({
			value: { rollovers: {} },
			spec: { rollovers: { items: { entities: "record" } } },
		});
		expect(result).toEqual({ rollovers: [] });
	});

	test("should leave unspecified fields untouched", () => {
		const result = sanitizeShape({
			value: { name: "test", items: {} },
			spec: { items: "array" },
		});
		expect(result).toEqual({ name: "test", items: [] });
	});

	test("should return {} for non-object input", () => {
		const result = sanitizeShape({ value: "not_an_object", spec: {} });
		expect(result).toEqual({});
	});
});

describe("sanitizeCachedSubjectBalance", () => {
	const buildMalformedSubjectBalance = (): unknown => ({
		id: "cus_ent_1",
		customer_product_id: "cp_1",
		entitlement_id: "ent_1",
		internal_customer_id: "cus_int_1",
		internal_entity_id: null,
		internal_feature_id: "feat_int_1",
		feature_id: "messages",
		unlimited: false,
		balance: 100,
		adjustment: 0,
		additional_balance: 0,
		usage_allowed: true,
		next_reset_at: null,
		expires_at: null,
		external_id: null,
		cache_version: 1,
		created_at: 1000,
		customer_id: "cus_1",
		rollovers: {},
		entities: [],
		entitlement: {
			id: "ent_1",
			created_at: 1,
			internal_feature_id: "feat_int_1",
			internal_product_id: "prod_int_1",
			is_custom: false,
			interval_count: 1,
			feature: {
				internal_id: "feat_int_1",
				org_id: "org_1",
				created_at: 1,
				env: AppEnv.Sandbox,
				id: "messages",
				name: "Messages",
				type: "metered",
				config: { usage_type: "single", schema: {} },
				archived: false,
				event_names: {},
				display: null,
			},
		},
		customerPrice: {
			id: "cp_1",
			internal_customer_id: "cus_int_1",
			customer_product_id: "cp_1",
			created_at: 1,
			price_id: "price_1",
			price: {
				id: "price_1",
				internal_product_id: "prod_int_1",
				billing_type: null,
				tier_behavior: null,
				config: {
					type: "usage",
					bill_when: "end_of_period",
					internal_feature_id: "feat_int_1",
					feature_id: "messages",
					usage_tiers: {},
					interval: "month",
				},
				entitlement_id: null,
				proration_config: null,
			},
		},
		customerProductOptions: null,
		customerProductQuantity: 1,
		isEntityLevel: false,
	});

	test("should coerce rollovers from {} to []", () => {
		const malformed = buildMalformedSubjectBalance() as SubjectBalance;
		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed,
		});
		expect(Array.isArray(result.rollovers)).toBe(true);
		expect(result.rollovers).toEqual([]);
	});

	test("should coerce entities from [] to null", () => {
		const malformed = buildMalformedSubjectBalance() as SubjectBalance;
		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed,
		});
		expect(result.entities).toBeNull();
	});

	test("should coerce entitlement.feature.event_names from {} to []", () => {
		const malformed = buildMalformedSubjectBalance() as SubjectBalance;
		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed,
		});
		expect(Array.isArray(result.entitlement.feature.event_names)).toBe(true);
		expect(result.entitlement.feature.event_names).toEqual([]);
	});

	test("should coerce customerPrice.price.config.usage_tiers from {} to []", () => {
		const malformed = buildMalformedSubjectBalance() as SubjectBalance;
		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed,
		});
		const config = result.customerPrice?.price?.config as Record<
			string,
			unknown
		>;
		expect(Array.isArray(config?.usage_tiers)).toBe(true);
	});

	test("should preserve valid fields untouched", () => {
		const malformed = buildMalformedSubjectBalance() as SubjectBalance;
		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed,
		});
		expect(result.id).toBe("cus_ent_1");
		expect(result.balance).toBe(100);
		expect(result.feature_id).toBe("messages");
		expect(result.entitlement.feature.name).toBe("Messages");
	});

	test("should handle rollovers array with nested entities coercion", () => {
		const malformed = buildMalformedSubjectBalance() as SubjectBalance;
		(malformed as unknown as Record<string, unknown>).rollovers = [
			{ id: "r1", cus_ent_id: "ce1", balance: 50, usage: 0, entities: "bad" },
		];
		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed,
		});
		expect(Array.isArray(result.rollovers)).toBe(true);
		expect(result.rollovers.length).toBe(1);
		expect(result.rollovers[0].entities).toEqual({});
	});
});

describe("sanitizeCachedFullSubject", () => {
	const buildMalformedCachedFullSubject = (): unknown => ({
		subjectType: "customer",
		customerId: "cus_1",
		internalCustomerId: "cus_int_1",
		_cachedAt: Date.now(),
		subjectViewEpoch: 1,
		meteredFeatures: {},
		customerEntitlementIdsByFeatureId: {},
		customer: {
			id: "cus_1",
			internal_id: "cus_int_1",
			org_id: "org_1",
			env: AppEnv.Live,
			created_at: 1,
			name: "Test",
			email: null,
			fingerprint: null,
			processor: null,
			processors: null,
			metadata: {},
			send_email_receipts: false,
			auto_topups: {},
			spend_limits: {},
			usage_alerts: {},
			overage_allowed: {},
		},
		entity: {
			id: "ent_1",
			org_id: "org_1",
			created_at: 1,
			internal_id: "ent_int_1",
			internal_customer_id: "cus_int_1",
			env: "live",
			name: null,
			deleted: false,
			feature_id: "messages",
			internal_feature_id: "feat_int_1",
			spend_limits: {},
			usage_alerts: {},
			overage_allowed: {},
		},
		customer_products: {},
		products: {},
		entitlements: [
			{
				id: "ent_1",
				created_at: 1,
				internal_feature_id: "feat_int_1",
				internal_product_id: "prod_int_1",
				is_custom: false,
				interval_count: 1,
				feature: {
					internal_id: "feat_int_1",
					org_id: "org_1",
					created_at: 1,
					env: "sandbox",
					id: "messages",
					name: "Messages",
					type: "metered",
					config: {},
					archived: false,
					event_names: {},
					display: null,
				},
			},
		],
		prices: [
			{
				id: "price_1",
				internal_product_id: "prod_int_1",
				billing_type: null,
				tier_behavior: null,
				config: {
					type: "usage",
					bill_when: "end_of_period",
					internal_feature_id: "feat_int_1",
					feature_id: "messages",
					usage_tiers: {},
					interval: "month",
				},
				entitlement_id: null,
				proration_config: null,
			},
		],
		free_trials: {},
		subscriptions: {},
		invoices: [
			{
				id: "inv_1",
				created_at: 1,
				internal_customer_id: "cus_int_1",
				internal_entity_id: null,
				product_ids: {},
				internal_product_ids: {},
				stripe_id: "in_1",
				status: "paid",
				hosted_invoice_url: null,
				total: 100,
				currency: "usd",
				discounts: {},
				items: {},
			},
		],
		flags: [],
		entity_aggregations: {
			aggregated_customer_products: [
				{
					id: "acp_1",
					internal_product_id: "prod_int_1",
					product_id: "prod_1",
					internal_customer_id: "cus_int_1",
					created_at: 1,
					status: "active",
					canceled: false,
					starts_at: 1,
					options: {},
					collection_method: "charge_automatically",
					quantity: 1,
					api_semver: null,
					is_custom: false,
					billing_version: "v1",
					external_id: null,
					subscription_ids: {},
					scheduled_ids: {},
				},
			],
			aggregated_customer_entitlements: {},
		},
	});

	test("should coerce top-level arrays from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.customer_products)).toBe(true);
		expect(result.customer_products).toEqual([]);
		expect(Array.isArray(result.products)).toBe(true);
		expect(result.products).toEqual([]);
		expect(Array.isArray(result.free_trials)).toBe(true);
		expect(result.free_trials).toEqual([]);
	});

	test("should coerce meteredFeatures from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.meteredFeatures)).toBe(true);
		expect(result.meteredFeatures).toEqual([]);
	});

	test("should coerce flags from [] to {}", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.flags)).toBe(false);
		expect(typeof result.flags).toBe("object");
		expect(result.flags).toEqual({});
	});

	test("should coerce customer.auto_topups from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.customer.auto_topups)).toBe(true);
	});

	test("should coerce customer.spend_limits from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.customer.spend_limits)).toBe(true);
	});

	test("should coerce customer.usage_alerts from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.customer.usage_alerts)).toBe(true);
	});

	test("should coerce customer.overage_allowed from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.customer.overage_allowed)).toBe(true);
	});

	test("should coerce entity.spend_limits from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.entity?.spend_limits)).toBe(true);
	});

	test("should coerce entity.usage_alerts from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.entity?.usage_alerts)).toBe(true);
	});

	test("should coerce entity.overage_allowed from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.entity?.overage_allowed)).toBe(true);
	});

	test("should coerce entitlements[].feature.event_names from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		const entitlements = result.entitlements as Array<{
			feature: { event_names: unknown };
		}>;
		expect(entitlements.length).toBe(1);
		expect(Array.isArray(entitlements[0].feature.event_names)).toBe(true);
		expect(entitlements[0].feature.event_names).toEqual([]);
	});

	test("should coerce prices[].config.usage_tiers from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		const prices = result.prices as Array<{
			config: { usage_tiers: unknown };
		}>;
		expect(prices.length).toBe(1);
		expect(Array.isArray(prices[0].config.usage_tiers)).toBe(true);
	});

	test("should coerce invoices[].product_ids from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(result.invoices.length).toBe(1);
		expect(Array.isArray(result.invoices[0].product_ids)).toBe(true);
	});

	test("should coerce invoices[].internal_product_ids from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.invoices[0].internal_product_ids)).toBe(true);
	});

	test("should coerce invoices[].discounts from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.invoices[0].discounts)).toBe(true);
	});

	test("should coerce invoices[].items from {} to []", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.invoices[0].items)).toBe(true);
	});

	test("should coerce entity_aggregations nested arrays", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		const entityAgg = result.entity_aggregations;
		expect(entityAgg).toBeDefined();
		expect(Array.isArray(entityAgg?.aggregated_customer_entitlements)).toBe(
			true,
		);
		const products = entityAgg?.aggregated_customer_products ?? [];
		expect(Array.isArray(products)).toBe(true);
		expect(products.length).toBe(1);
		expect(Array.isArray(products[0].options)).toBe(true);
		expect(Array.isArray(products[0].subscription_ids)).toBe(true);
		expect(Array.isArray(products[0].scheduled_ids)).toBe(true);
	});

	test("should coerce subscriptions from {} to [] and recurse usage_features", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		(malformed as unknown as Record<string, unknown>).subscriptions = [
			{
				id: "sub_1",
				stripe_id: null,
				stripe_schedule_id: null,
				created_at: 1,
				usage_features: {},
				org_id: "org_1",
				current_period_start: null,
				current_period_end: null,
				env: "live",
			},
		];
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(Array.isArray(result.subscriptions)).toBe(true);
		expect(result.subscriptions.length).toBe(1);
		expect(Array.isArray(result.subscriptions[0].usage_features)).toBe(true);
	});

	test("should preserve scalar fields untouched", () => {
		const malformed = buildMalformedCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed,
		});
		expect(result.customerId).toBe("cus_1");
		expect(result.subjectViewEpoch).toBe(1);
		expect(result.customer.name).toBe("Test");
	});
});
