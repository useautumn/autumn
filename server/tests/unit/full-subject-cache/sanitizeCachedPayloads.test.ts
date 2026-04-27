import { describe, expect, test } from "bun:test";
import {
	type AggregatedFeatureBalanceSchema,
	AppEnv,
	type SubjectBalance,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { CachedFullSubject } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import { normalizeFromSchema } from "@/internal/customers/cache/fullSubject/sanitize/normalizeFromSchema.js";
import { sanitizeCachedAggregatedFeatureBalance } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedAggregatedFeatureBalance.js";
import { sanitizeCachedFullSubject } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedFullSubject.js";
import { sanitizeCachedSubjectBalance } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedSubjectBalance.js";

describe("normalizeFromSchema (core walker)", () => {
	test("fills undefined at nullable position with null", () => {
		const schema = z.object({ expires_at: z.number().nullable() });
		const result = normalizeFromSchema<{ expires_at: number | null }>({
			schema,
			data: {},
		});
		expect(result.expires_at).toBeNull();
	});

	test("treats .nullish() as nullable (undefined -> null)", () => {
		const schema = z.object({ x: z.number().nullish() });
		const result = normalizeFromSchema<{ x: number | null | undefined }>({
			schema,
			data: {},
		});
		expect(result.x).toBeNull();
	});

	test("leaves pure .optional() undefined as undefined", () => {
		const schema = z.object({ x: z.number().optional() });
		const result = normalizeFromSchema<{ x: number | undefined }>({
			schema,
			data: {},
		});
		expect(result.x).toBeUndefined();
	});

	test("applies ZodDefault when data is undefined", () => {
		const schema = z.object({ x: z.number().default(42) });
		const result = normalizeFromSchema<{ x: number }>({ schema, data: {} });
		expect(result.x).toBe(42);
	});

	test("ZodDefault wins over nullable wrapper", () => {
		const schema = z.object({ adjustment: z.number().nullable().default(0) });
		const result = normalizeFromSchema<{ adjustment: number | null }>({
			schema,
			data: {},
		});
		expect(result.adjustment).toBe(0);
	});

	test("coerces empty object {} to [] when schema says array", () => {
		const schema = z.object({ items: z.array(z.string()) });
		const result = normalizeFromSchema<{ items: string[] }>({
			schema,
			data: { items: {} },
		});
		expect(result.items).toEqual([]);
	});

	test("coerces empty array [] to {} when schema says record", () => {
		const schema = z.object({
			flags: z.record(z.string(), z.boolean()),
		});
		const result = normalizeFromSchema<{ flags: Record<string, boolean> }>({
			schema,
			data: { flags: [] },
		});
		expect(result.flags).toEqual({});
	});

	test("recurses into nested arrays (filling null inside array items)", () => {
		const schema = z.object({
			items: z.array(z.object({ id: z.string(), due: z.number().nullable() })),
		});
		const result = normalizeFromSchema<{
			items: Array<{ id: string; due: number | null }>;
		}>({
			schema,
			data: { items: [{ id: "a" }, { id: "b", due: 5 }] },
		});
		expect(result.items[0].due).toBeNull();
		expect(result.items[1].due).toBe(5);
	});

	test("recurses into records (filling null inside record values)", () => {
		const schema = z.object({
			flags: z.record(
				z.string(),
				z.object({ expiresAt: z.number().nullable() }),
			),
		});
		const result = normalizeFromSchema<{
			flags: Record<string, { expiresAt: number | null }>;
		}>({
			schema,
			data: { flags: { a: {} } },
		});
		expect(result.flags.a.expiresAt).toBeNull();
	});

	test("preserves unknown keys not covered by schema", () => {
		const schema = z.object({ known: z.string() });
		const result = normalizeFromSchema<Record<string, unknown>>({
			schema,
			data: { known: "x", unknown: "preserved" },
		});
		expect(result.unknown).toBe("preserved");
	});

	test("returns null for explicit null passthrough", () => {
		const schema = z.object({ x: z.number().nullable() });
		const result = normalizeFromSchema<{ x: number | null }>({
			schema,
			data: { x: null },
		});
		expect(result.x).toBeNull();
	});

	test("does not touch present non-nullable fields", () => {
		const schema = z.object({ name: z.string() });
		const result = normalizeFromSchema<{ name: string }>({
			schema,
			data: { name: "abc" },
		});
		expect(result.name).toBe("abc");
	});

	test("never throws on schema-mismatched data", () => {
		const schema = z.object({ x: z.number().nullable() });
		expect(() =>
			normalizeFromSchema({ schema, data: "not an object" }),
		).not.toThrow();
	});
});

describe("sanitizeCachedSubjectBalance", () => {
	const buildSubjectBalance = (): unknown => ({
		id: "cus_ent_1",
		customer_product_id: "cp_1",
		entitlement_id: "ent_1",
		internal_customer_id: "cus_int_1",
		internal_entity_id: null,
		internal_feature_id: "feat_int_1",
		feature_id: "messages",
		balance: 100,
		additional_balance: 0,
		entities: null,
		created_at: 1000,
		customer_id: "cus_1",
		replaceables: [],
		rollovers: [],
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
				event_names: [],
				display: null,
			},
		},
		customerPrice: null,
		customerProductOptions: null,
		customerProductQuantity: 1,
		isEntityLevel: false,
	});

	test("fills dropped nullable scalars (Upstash null-drop repair)", () => {
		const malformed = buildSubjectBalance() as Record<string, unknown>;
		// Remove fields that Upstash Lua cjson would have dropped when they were null
		delete malformed.expires_at;
		delete malformed.next_reset_at;
		delete malformed.unlimited;
		delete malformed.usage_allowed;
		delete malformed.external_id;
		delete malformed.cache_version;

		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed as unknown as SubjectBalance,
		});

		expect(result.expires_at).toBeNull();
		expect(result.next_reset_at).toBeNull();
		expect(result.unlimited).toBeNull();
		expect(result.usage_allowed).toBeNull();
		expect(result.external_id).toBeNull();
		// cache_version has .default(0) in CustomerEntitlementSchema; default wins
		expect(result.cache_version).toBe(0);
	});

	test("coerces rollovers from {} to []", () => {
		const malformed = buildSubjectBalance() as Record<string, unknown>;
		malformed.rollovers = {};
		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed as unknown as SubjectBalance,
		});
		expect(Array.isArray(result.rollovers)).toBe(true);
		expect(result.rollovers).toEqual([]);
	});

	test("fills dropped expires_at inside rollovers array items", () => {
		const malformed = buildSubjectBalance() as Record<string, unknown>;
		malformed.rollovers = [
			{ id: "r1", cus_ent_id: "ce1", balance: 50, usage: 0, entities: {} },
		];
		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed as unknown as SubjectBalance,
		});
		expect(result.rollovers.length).toBe(1);
		expect(result.rollovers[0].expires_at).toBeNull();
	});

	test("passes through helper fields not on the schema (isEntityLevel, customerProductQuantity)", () => {
		const malformed = buildSubjectBalance() as Record<string, unknown>;
		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed as unknown as SubjectBalance,
		});
		expect(result.isEntityLevel).toBe(false);
		expect(result.customerProductQuantity).toBe(1);
	});

	test("preserves valid scalar fields untouched", () => {
		const malformed = buildSubjectBalance() as Record<string, unknown>;
		const result = sanitizeCachedSubjectBalance({
			subjectBalance: malformed as unknown as SubjectBalance,
		});
		expect(result.id).toBe("cus_ent_1");
		expect(result.balance).toBe(100);
		expect(result.feature_id).toBe("messages");
		expect(result.entitlement.feature.name).toBe("Messages");
	});
});

describe("sanitizeCachedFullSubject", () => {
	const buildCachedFullSubject = (): unknown => ({
		subjectType: "customer",
		customerId: "cus_1",
		internalCustomerId: "cus_int_1",
		_cachedAt: Date.now(),
		subjectViewEpoch: 1,
		meteredFeatures: [],
		customerEntitlementIdsByFeatureId: {},
		customer: {
			internal_id: "cus_int_1",
			org_id: "org_1",
			env: AppEnv.Live,
			created_at: 1,
		},
		entity: {
			org_id: "org_1",
			created_at: 1,
			internal_id: "ent_int_1",
			internal_customer_id: "cus_int_1",
			env: "live",
			deleted: false,
			feature_id: "messages",
			internal_feature_id: "feat_int_1",
		},
		customer_products: [],
		products: [],
		entitlements: [],
		prices: [],
		free_trials: [],
		subscriptions: [],
		invoices: [],
		flags: {},
	});

	test("fills customer.email / customer.name dropped by Upstash", () => {
		const malformed = buildCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({ cachedFullSubject: malformed });
		expect(result.customer.email).toBeNull();
		expect(result.customer.name).toBeNull();
		expect(result.customer.fingerprint).toBeNull();
	});

	test("fills entity.name / entity.id dropped by Upstash", () => {
		const malformed = buildCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({ cachedFullSubject: malformed });
		expect(result.entity?.name).toBeNull();
		expect(result.entity?.id).toBeNull();
	});

	test("coerces subscriptions from {} to [] (Upstash empty-table encoding)", () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed.subscriptions = {};
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		expect(Array.isArray(result.subscriptions)).toBe(true);
		expect(result.subscriptions).toEqual([]);
	});

	test("coerces flags from [] to {} and fills nullable scalars on flag entries", () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed.flags = {
			seat: {
				featureId: "seat",
				internalFeatureId: "if_seat",
				entitlementId: "e_seat",
				customerEntitlementId: "ce_seat",
				internalCustomerId: "cus_int_1",
				// customerProductId, internalEntityId, expiresAt, externalId all dropped
			},
		};
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		expect(Array.isArray(result.flags)).toBe(false);
		const seat = (result.flags as Record<string, Record<string, unknown>>).seat;
		expect(seat.customerProductId).toBeNull();
		expect(seat.internalEntityId).toBeNull();
		expect(seat.expiresAt).toBeNull();
		expect(seat.externalId).toBeNull();
	});

	test("fills dropped canceled_at / ended_at inside customer_products array", () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed.customer_products = [
			{
				id: "cp_1",
				internal_product_id: "ip_1",
				product_id: "p_1",
				internal_customer_id: "cus_int_1",
				created_at: 1,
				status: "active",
				canceled: false,
				starts_at: 1,
				options: [],
				collection_method: "charge_automatically",
				api_semver: null,
				is_custom: false,
				billing_version: "v1",
				external_id: null,
				// trial_ends_at / canceled_at / ended_at / billing_cycle_anchor_resets_at
				// / free_trial_id dropped
			},
		];
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		const cp = result.customer_products[0] as unknown as Record<
			string,
			unknown
		>;
		expect(cp.trial_ends_at).toBeNull();
		expect(cp.canceled_at).toBeNull();
		expect(cp.ended_at).toBeNull();
		expect(cp.billing_cycle_anchor_resets_at).toBeNull();
		expect(cp.free_trial_id).toBeNull();
	});

	test("fills dropped canceled / current_period_start on subscriptions", () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed.subscriptions = [
			{
				id: "sub_1",
				created_at: 1,
				usage_features: [],
				org_id: "org_1",
				env: "live",
				// stripe_id, stripe_schedule_id, current_period_start/end dropped
			},
		];
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		expect(result.subscriptions[0].stripe_id).toBeNull();
		expect(result.subscriptions[0].stripe_schedule_id).toBeNull();
		expect(result.subscriptions[0].current_period_start).toBeNull();
		expect(result.subscriptions[0].current_period_end).toBeNull();
	});

	test("fills dropped hosted_invoice_url / internal_entity_id on invoices", () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed.invoices = [
			{
				id: "inv_1",
				created_at: 1,
				internal_customer_id: "cus_int_1",
				product_ids: [],
				internal_product_ids: [],
				stripe_id: "in_1",
				total: 100,
				currency: "usd",
				discounts: [],
				items: [],
				// hosted_invoice_url, internal_entity_id dropped
			},
		];
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		expect(result.invoices[0].hosted_invoice_url).toBeNull();
		expect(result.invoices[0].internal_entity_id).toBeNull();
	});

	test("preserves unknown top-level keys not on the schema", () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed._futureField = "future";
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		expect((result as unknown as Record<string, unknown>)._futureField).toBe(
			"future",
		);
	});

	test("preserves scalar cache metadata fields", () => {
		const malformed = buildCachedFullSubject() as CachedFullSubject;
		const result = sanitizeCachedFullSubject({ cachedFullSubject: malformed });
		expect(result.customerId).toBe("cus_1");
		expect(result.subjectViewEpoch).toBe(1);
	});
});

describe("sanitizeCachedAggregatedFeatureBalance", () => {
	test("fills undefined at nullable positions for AggregatedFeatureBalance", () => {
		// AggregatedFeatureBalance entities is .nullish() — undefined should
		// become null after walker pass.
		const malformed = {
			api_id: "f1",
			internal_feature_id: "if_1",
			internal_customer_id: "cus_int_1",
			feature_id: "messages",
			allowance_total: 100,
			balance: 50,
			adjustment: 0,
			additional_balance: 0,
			unlimited: false,
			usage_allowed: false,
			entity_count: 0,
			// entities dropped by Upstash null-strip
		};
		const result = sanitizeCachedAggregatedFeatureBalance({
			aggregated: malformed as unknown as z.infer<
				typeof AggregatedFeatureBalanceSchema
			>,
		});
		expect(result.entities).toBeNull();
	});

	test("applies schema defaults for rollover_balance / rollover_usage", () => {
		const malformed = {
			api_id: "f1",
			internal_feature_id: "if_1",
			internal_customer_id: "cus_int_1",
			feature_id: "messages",
			allowance_total: 100,
			balance: 50,
			adjustment: 0,
			additional_balance: 0,
			unlimited: false,
			usage_allowed: false,
			entity_count: 0,
			entities: null,
		};
		const result = sanitizeCachedAggregatedFeatureBalance({
			aggregated: malformed as unknown as z.infer<
				typeof AggregatedFeatureBalanceSchema
			>,
		});
		// rollover_balance has .default(0)
		expect(result.rollover_balance).toBe(0);
		expect(result.rollover_usage).toBe(0);
		expect(result.prepaid_grant_from_options).toBe(0);
	});
});
