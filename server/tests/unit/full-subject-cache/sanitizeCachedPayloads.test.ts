import { describe, expect, test } from "bun:test";
import {
	type AggregatedFeatureBalanceSchema,
	AppEnv,
	type FullCustomer,
	FullCustomerSchema,
	ProcessorType,
	ProductSchema,
	type SubjectBalance,
} from "@autumn/shared";
import { z } from "zod/v4";
import {
	type CachedFullSubject,
	CachedFullSubjectSchema,
} from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import { normalizeFromSchema } from "@/internal/customers/cache/fullSubject/sanitize/normalizeFromSchema.js";
import { sanitizeCachedAggregatedFeatureBalance } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedAggregatedFeatureBalance.js";
import { sanitizeCachedFullSubject } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedFullSubject.js";
import { sanitizeCachedSubjectBalance } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedSubjectBalance.js";
import { normalizeFromSchema as normalizeFromSchemaCacheUtils } from "@/utils/cacheUtils/normalizeFromSchema.js";

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

	test("ZodDefault fires for ProcessorType enum on undefined (FullSubject walker)", () => {
		const schema = z.object({
			processor_type: z.enum(ProcessorType).default(ProcessorType.Stripe),
		});
		const result = normalizeFromSchema<{ processor_type: ProcessorType }>({
			schema,
			data: {},
		});
		expect(result.processor_type).toBe(ProcessorType.Stripe);
	});

	test("ZodDefault passes through explicit null (FullSubject walker)", () => {
		const schema = z.object({
			processor_type: z.enum(ProcessorType).default(ProcessorType.Stripe),
		});
		const result = normalizeFromSchema<{
			processor_type: ProcessorType | null;
		}>({
			schema,
			data: { processor_type: null },
		});
		expect(result.processor_type).toBeNull();
	});

	test("ZodDefault does NOT fire on primitive leaves in cacheUtils walker (documented limitation)", () => {
		const schema = z.object({
			processor_type: z.enum(ProcessorType).default(ProcessorType.Stripe),
		});
		const result = normalizeFromSchemaCacheUtils<{
			processor_type: ProcessorType | undefined;
		}>({
			schema: schema as unknown as z.ZodTypeAny,
			data: {},
		});
		expect(result.processor_type).toBeUndefined();
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

describe("sanitizeCachedFullSubject — processor_type (Option A walker behavior)", () => {
	const buildCachedFullSubject = (): unknown => ({
		subjectType: "customer",
		customerId: "cus_proc",
		internalCustomerId: "cus_int_proc",
		_cachedAt: Date.now(),
		subjectViewEpoch: 1,
		meteredFeatures: [],
		customerEntitlementIdsByFeatureId: {},
		customer: {
			internal_id: "cus_int_proc",
			org_id: "org_proc",
			env: AppEnv.Live,
			created_at: 1,
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

	const buildInvoice = (
		overrides: Record<string, unknown> = {},
	): Record<string, unknown> => ({
		id: "inv_proc",
		created_at: 1,
		internal_customer_id: "cus_int_proc",
		product_ids: [],
		internal_product_ids: [],
		stripe_id: "in_proc",
		total: 100,
		currency: "usd",
		discounts: [],
		items: [],
		...overrides,
	});

	test("walker fills missing processor_type via ZodDefault → stripe", () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed.invoices = [buildInvoice()];
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		expect(result.invoices[0].processor_type).toBe(ProcessorType.Stripe);
	});

	test("walker passes through explicit null processor_type unchanged", () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed.invoices = [buildInvoice({ processor_type: null })];
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		expect(result.invoices[0].processor_type).toBeNull();
	});

	test("walker preserves explicit processor_type='stripe'", () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed.invoices = [
			buildInvoice({ processor_type: ProcessorType.Stripe }),
		];
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		expect(result.invoices[0].processor_type).toBe(ProcessorType.Stripe);
	});

	test("walker preserves explicit processor_type='revenuecat' (no over-correction)", () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed.invoices = [
			buildInvoice({ processor_type: ProcessorType.RevenueCat }),
		];
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		expect(result.invoices[0].processor_type).toBe(ProcessorType.RevenueCat);
	});

	test("end-to-end: walker null + processInvoice consumer → wire stripe", async () => {
		const malformed = buildCachedFullSubject() as unknown as Record<
			string,
			unknown
		>;
		malformed.invoices = [buildInvoice({ processor_type: null })];
		const sanitized = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});
		expect(sanitized.invoices[0].processor_type).toBeNull();

		const { processInvoice } = await import(
			"@/internal/invoices/InvoiceService.js"
		);
		const wire = processInvoice({
			invoice: sanitized.invoices[0],
		});
		expect(wire.processor_type).toBe(ProcessorType.Stripe);
	});

	test("end-to-end pre-update rollover: cache JSON missing field → JSON.parse → walker → processInvoice → wire stripe", async () => {
		const preUpdateInvoice = buildInvoice();
		delete (preUpdateInvoice as Record<string, unknown>).processor_type;

		const cachedJson = JSON.stringify({
			...(buildCachedFullSubject() as Record<string, unknown>),
			invoices: [preUpdateInvoice],
		});

		const deserialized = JSON.parse(cachedJson) as Record<string, unknown>;
		expect(
			(deserialized.invoices as Record<string, unknown>[])[0]
				.processor_type,
		).toBeUndefined();

		const sanitized = sanitizeCachedFullSubject({
			cachedFullSubject: deserialized as unknown as CachedFullSubject,
		});
		expect(sanitized.invoices[0].processor_type).toBe(ProcessorType.Stripe);

		const { processInvoice } = await import(
			"@/internal/invoices/InvoiceService.js"
		);
		const wire = processInvoice({ invoice: sanitized.invoices[0] });
		expect(wire.processor_type).toBe(ProcessorType.Stripe);
		expect(wire.stripe_id).toBe("in_proc");
	});

	test("end-to-end post-update revenuecat row: cache JSON with revenuecat → roundtrip → wire revenuecat", async () => {
		const postUpdateInvoice = buildInvoice({
			processor_type: ProcessorType.RevenueCat,
			stripe_id: "rc_txn_42",
		});

		const cachedJson = JSON.stringify({
			...(buildCachedFullSubject() as Record<string, unknown>),
			invoices: [postUpdateInvoice],
		});

		const deserialized = JSON.parse(cachedJson) as Record<string, unknown>;
		expect(
			(deserialized.invoices as Record<string, unknown>[])[0]
				.processor_type,
		).toBe(ProcessorType.RevenueCat);

		const sanitized = sanitizeCachedFullSubject({
			cachedFullSubject: deserialized as unknown as CachedFullSubject,
		});
		expect(sanitized.invoices[0].processor_type).toBe(
			ProcessorType.RevenueCat,
		);

		const { processInvoice } = await import(
			"@/internal/invoices/InvoiceService.js"
		);
		const wire = processInvoice({ invoice: sanitized.invoices[0] });
		expect(wire.processor_type).toBe(ProcessorType.RevenueCat);
		expect(wire.stripe_id).toBe("rc_txn_42");
	});
});

describe("FullCustomer v1 cache — processor_type rollover", () => {
	const buildFullCustomer = (
		overrides: Record<string, unknown> = {},
	): Record<string, unknown> => ({
		internal_id: "cus_int_v1",
		org_id: "org_v1",
		env: AppEnv.Live,
		created_at: 1,
		id: "cus_v1",
		name: null,
		email: null,
		fingerprint: null,
		processor: null,
		processors: {},
		metadata: {},
		send_email_receipts: false,
		auto_topups: null,
		spend_limits: null,
		usage_alerts: null,
		overage_allowed: null,
		config: null,
		customer_products: [],
		entities: [],
		extra_customer_entitlements: [],
		invoices: [],
		...overrides,
	});

	const buildInvoice = (
		overrides: Record<string, unknown> = {},
	): Record<string, unknown> => ({
		id: "inv_v1",
		created_at: 1,
		internal_customer_id: "cus_int_v1",
		internal_entity_id: null,
		product_ids: [],
		internal_product_ids: [],
		stripe_id: "in_v1",
		status: "paid",
		hosted_invoice_url: null,
		total: 100,
		amount_paid: 100,
		refunded_amount: 0,
		currency: "usd",
		discounts: [],
		items: [],
		...overrides,
	});

	test("pre-update rollover: cache JSON missing processor_type → cacheUtils walker → processInvoice → wire stripe", async () => {
		const preUpdateInvoice = buildInvoice();
		delete (preUpdateInvoice as Record<string, unknown>).processor_type;

		const cachedJson = JSON.stringify(
			buildFullCustomer({ invoices: [preUpdateInvoice] }),
		);
		const deserialized = JSON.parse(cachedJson) as Record<string, unknown>;
		expect(
			(deserialized.invoices as Record<string, unknown>[])[0]
				.processor_type,
		).toBeUndefined();

		const fullCustomer = normalizeFromSchemaCacheUtils<FullCustomer>({
			schema: FullCustomerSchema as unknown as z.ZodTypeAny,
			data: deserialized,
		});

		expect(
			(fullCustomer.invoices ?? [])[0]?.processor_type,
		).toBeUndefined();

		const { processInvoice } = await import(
			"@/internal/invoices/InvoiceService.js"
		);
		const wire = processInvoice({
			invoice: (fullCustomer.invoices ?? [])[0]!,
		});
		expect(wire.processor_type).toBe(ProcessorType.Stripe);
		expect(wire.stripe_id).toBe("in_v1");
	});

	test("explicit null processor_type → cacheUtils walker passthrough → processInvoice → wire stripe", async () => {
		const cachedJson = JSON.stringify(
			buildFullCustomer({
				invoices: [buildInvoice({ processor_type: null })],
			}),
		);
		const deserialized = JSON.parse(cachedJson) as Record<string, unknown>;

		const fullCustomer = normalizeFromSchemaCacheUtils<FullCustomer>({
			schema: FullCustomerSchema as unknown as z.ZodTypeAny,
			data: deserialized,
		});
		expect((fullCustomer.invoices ?? [])[0]?.processor_type).toBeNull();

		const { processInvoice } = await import(
			"@/internal/invoices/InvoiceService.js"
		);
		const wire = processInvoice({
			invoice: (fullCustomer.invoices ?? [])[0]!,
		});
		expect(wire.processor_type).toBe(ProcessorType.Stripe);
	});

	test("post-update revenuecat row → cacheUtils walker preserves → wire revenuecat", async () => {
		const cachedJson = JSON.stringify(
			buildFullCustomer({
				invoices: [
					buildInvoice({
						processor_type: ProcessorType.RevenueCat,
						stripe_id: "rc_txn_v1",
					}),
				],
			}),
		);
		const deserialized = JSON.parse(cachedJson) as Record<string, unknown>;

		const fullCustomer = normalizeFromSchemaCacheUtils<FullCustomer>({
			schema: FullCustomerSchema as unknown as z.ZodTypeAny,
			data: deserialized,
		});
		expect((fullCustomer.invoices ?? [])[0]?.processor_type).toBe(
			ProcessorType.RevenueCat,
		);

		const { processInvoice } = await import(
			"@/internal/invoices/InvoiceService.js"
		);
		const wire = processInvoice({
			invoice: (fullCustomer.invoices ?? [])[0]!,
		});
		expect(wire.processor_type).toBe(ProcessorType.RevenueCat);
		expect(wire.stripe_id).toBe("rc_txn_v1");
	});

	test("post-update stripe row with explicit processor_type → cacheUtils walker preserves → wire stripe", async () => {
		const cachedJson = JSON.stringify(
			buildFullCustomer({
				invoices: [
					buildInvoice({ processor_type: ProcessorType.Stripe }),
				],
			}),
		);
		const deserialized = JSON.parse(cachedJson) as Record<string, unknown>;

		const fullCustomer = normalizeFromSchemaCacheUtils<FullCustomer>({
			schema: FullCustomerSchema as unknown as z.ZodTypeAny,
			data: deserialized,
		});
		expect((fullCustomer.invoices ?? [])[0]?.processor_type).toBe(
			ProcessorType.Stripe,
		);

		const { processInvoice } = await import(
			"@/internal/invoices/InvoiceService.js"
		);
		const wire = processInvoice({
			invoice: (fullCustomer.invoices ?? [])[0]!,
		});
		expect(wire.processor_type).toBe(ProcessorType.Stripe);
	});
});

describe("sanitizeCachedAggregatedFeatureBalance", () => {
	test("fills undefined at nullable positions for AggregatedFeatureBalance", () => {
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
		expect(result.rollover_balance).toBe(0);
		expect(result.rollover_usage).toBe(0);
		expect(result.prepaid_grant_from_options).toBe(0);
	});
});

const buildBaseCachedFullSubjectForSanitize = (): CachedFullSubject =>
	({
		subjectType: "customer",
		customerId: "cus_sanitize",
		internalCustomerId: "cus_int_sanitize",
		_cachedAt: Date.now(),
		subjectViewEpoch: 0,
		meteredFeatures: [],
		customerEntitlementIdsByFeatureId: {},
		customer: {
			internal_id: "cus_int_sanitize",
			org_id: "org_sanitize",
			env: AppEnv.Live,
			created_at: 1,
		},
		customer_products: [],
		products: [],
		entitlements: [],
		prices: [],
		free_trials: [],
		subscriptions: [],
		invoices: [],
		flags: {},
	}) as unknown as CachedFullSubject;

const buildBaseProductForSanitize = (planId = "plan_sanitize") =>
	({
		id: planId,
		internal_id: `ip_${planId}`,
		name: planId,
		group: `grp_${planId}`,
		created_at: 1,
		env: AppEnv.Live,
		org_id: "org_sanitize",
		is_add_on: false,
		is_default: false,
		version: 1,
		archived: false,
	}) as Record<string, unknown>;

describe("sanitizeCachedFullSubject — product.config (commit ce100dbf)", () => {
	test("coerces product.config: [] -> {} and re-applies ignore_past_due default", () => {
		const malformed = buildBaseCachedFullSubjectForSanitize() as unknown as Record<
			string,
			unknown
		>;
		malformed.products = [
			{
				...buildBaseProductForSanitize("plan_sanitize_empty_array_config"),
				config: [],
			},
		];

		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});

		const product = result.products[0] as unknown as {
			config: { ignore_past_due?: boolean };
		};

		expect(Array.isArray(product.config)).toBe(false);
		expect(product.config).toBeDefined();
		expect(typeof product.config).toBe("object");

		expect(product.config.ignore_past_due).toBe(false);
	});

	test("fills missing product.config entirely (pre-field-existed cache entries)", () => {
		const malformed = buildBaseCachedFullSubjectForSanitize() as unknown as Record<
			string,
			unknown
		>;
		malformed.products = [buildBaseProductForSanitize("plan_sanitize_missing_config")];

		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});

		const product = result.products[0] as unknown as {
			config: Record<string, unknown>;
		};
		expect(product.config).toBeDefined();
		expect(Array.isArray(product.config)).toBe(false);
		expect(typeof product.config).toBe("object");
	});

	test("preserves explicit ignore_past_due=true (no over-correction)", () => {
		const malformed = buildBaseCachedFullSubjectForSanitize() as unknown as Record<
			string,
			unknown
		>;
		malformed.products = [
			{
				...buildBaseProductForSanitize("plan_sanitize_preserve_true"),
				config: { ignore_past_due: true },
			},
		];

		const result = sanitizeCachedFullSubject({
			cachedFullSubject: malformed as unknown as CachedFullSubject,
		});

		const product = result.products[0] as unknown as {
			config: { ignore_past_due: boolean };
		};
		expect(product.config.ignore_past_due).toBe(true);
	});
});

describe("normalizeFromSchema — empty-array-as-object regression (commit ce100dbf)", () => {
	test("cacheUtils walker rebuilds ZodObject from empty array on nested products", () => {
		const TestSchema = z.object({
			products: z.array(ProductSchema),
		});

		const result = normalizeFromSchemaCacheUtils<{
			products: Array<{ config: unknown }>;
		}>({
			schema: TestSchema as unknown as z.ZodTypeAny,
			data: {
				products: [
					{
						...buildBaseProductForSanitize("plan_sanitize_cacheutils"),
						config: [],
					},
				],
			},
		});

		const product = result.products[0]!;
		expect(Array.isArray(product.config)).toBe(false);
		expect(typeof product.config).toBe("object");
		expect(product.config).not.toBeNull();
	});

	test("full-subject walker rebuilds ZodObject from empty array on nested products", () => {
		const result = normalizeFromSchema<{
			products: Array<{ config: { ignore_past_due: boolean } }>;
		}>({
			schema: CachedFullSubjectSchema,
			data: {
				...(buildBaseCachedFullSubjectForSanitize() as unknown as Record<
					string,
					unknown
				>),
				products: [
					{
						...buildBaseProductForSanitize("plan_sanitize_fullsubject"),
						config: [],
					},
				],
			},
		});

		const product = result.products[0]!;
		expect(Array.isArray(product.config)).toBe(false);
		expect(product.config.ignore_past_due).toBe(false);
	});
});

describe("sanitizeCachedFullSubject — version identity backfill", () => {
	const subjectWithProduct = (
		productOverrides: Record<string, unknown>,
	): CachedFullSubject => {
		const subject = buildBaseCachedFullSubjectForSanitize() as unknown as Record<
			string,
			unknown
		>;
		subject.products = [
			{
				...buildBaseProductForSanitize("plan_version_identity"),
				config: {},
				...productOverrides,
			},
		];
		return subject as unknown as CachedFullSubject;
	};

	test("fills absent version_slug and active (pre-migration cache entry)", () => {
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: subjectWithProduct({}),
		});
		expect(result.products[0].version_slug).toBe("v1");
		expect(result.products[0].active).toBe(false);
	});

	test("slug fill derives from the row's own version", () => {
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: subjectWithProduct({ version: 3 }),
		});
		expect(result.products[0].version_slug).toBe("v3");
	});

	test("preserves real cached values (no over-correction)", () => {
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: subjectWithProduct({
				version_slug: "launch",
				active: true,
			}),
		});
		expect(result.products[0].version_slug).toBe("launch");
		expect(result.products[0].active).toBe(true);
	});

	test("preserves explicit active=false", () => {
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: subjectWithProduct({
				version_slug: "v2",
				active: false,
			}),
		});
		expect(result.products[0].active).toBe(false);
	});

	test("passes through explicit null version_slug unchanged (only undefined is filled)", () => {
		const result = sanitizeCachedFullSubject({
			cachedFullSubject: subjectWithProduct({
				version_slug: null,
				active: true,
			}),
		});
		expect(result.products[0].version_slug).toBeNull();
	});

	test("fills nested customer_licenses[].planLicense.product (not joined from products[])", () => {
		const subject = buildBaseCachedFullSubjectForSanitize() as unknown as Record<
			string,
			unknown
		>;
		subject.customer_licenses = [
			{
				planLicense: {
					product: buildBaseProductForSanitize("license_plan"),
					base_product: {
						...buildBaseProductForSanitize("license_base"),
						version: 2,
					},
				},
			},
		];

		const result = sanitizeCachedFullSubject({
			cachedFullSubject: subject as unknown as CachedFullSubject,
		});

		expect(result.customer_licenses[0].planLicense?.product.version_slug).toBe(
			"v1",
		);
		expect(result.customer_licenses[0].planLicense?.product.active).toBe(false);
		expect(
			result.customer_licenses[0].planLicense?.base_product?.version_slug,
		).toBe("v2");
	});
});

type SanitizerCorruptionMode =
	| "object_to_empty_array"
	| "array_to_empty_object"
	| "drop_field"
	| "set_null"
	| "set_undefined";

const ALL_SANITIZER_CORRUPTION_MODES: SanitizerCorruptionMode[] = [
	"object_to_empty_array",
	"array_to_empty_object",
	"drop_field",
	"set_null",
	"set_undefined",
];

const corruptValueForSanitizer = (
	value: unknown,
	mode: SanitizerCorruptionMode,
): unknown => {
	switch (mode) {
		case "object_to_empty_array":
			return value && typeof value === "object" && !Array.isArray(value)
				? []
				: value;
		case "array_to_empty_object":
			return Array.isArray(value) ? {} : value;
		case "drop_field":
			return undefined;
		case "set_null":
			return null;
		case "set_undefined":
			return undefined;
	}
};

const corruptAllFieldsForSanitizer = (
	data: unknown,
	mode: SanitizerCorruptionMode,
	depth = 0,
): unknown => {
	if (depth > 4) return data;
	if (Array.isArray(data)) {
		return data.map((item) =>
			corruptAllFieldsForSanitizer(item, mode, depth + 1),
		);
	}
	if (data && typeof data === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(data)) {
			const recursed = corruptAllFieldsForSanitizer(value, mode, depth + 1);
			out[key] = corruptValueForSanitizer(recursed, mode);
		}
		return out;
	}
	return data;
};

const assertNoArrayShapedObjects = (
	value: unknown,
	schema: z.ZodTypeAny,
	path = "$",
): void => {
	let unwrapped: z.ZodTypeAny = schema;
	while (
		unwrapped instanceof z.ZodOptional ||
		unwrapped instanceof z.ZodNullable ||
		unwrapped instanceof z.ZodDefault
	) {
		unwrapped = (unwrapped as unknown as { _def: { innerType: z.ZodTypeAny } })
			._def.innerType;
	}

	if (unwrapped instanceof z.ZodObject) {
		if (Array.isArray(value)) {
			throw new Error(
				`Sanitizer left an array at object position ${path} (caller would see "Expected object, received array")`,
			);
		}
		if (value && typeof value === "object") {
			const shape = (unwrapped as unknown as { _def: { shape: Record<string, z.ZodTypeAny> } })._def.shape;
			for (const [key, childSchema] of Object.entries(shape)) {
				assertNoArrayShapedObjects(
					(value as Record<string, unknown>)[key],
					childSchema,
					`${path}.${key}`,
				);
			}
		}
		return;
	}

	if (unwrapped instanceof z.ZodArray) {
		if (Array.isArray(value)) {
			const element = (unwrapped as unknown as { _def: { element: z.ZodTypeAny } })._def.element;
			value.forEach((item, idx) =>
				assertNoArrayShapedObjects(item, element, `${path}[${idx}]`),
			);
		}
		return;
	}
};

describe("sanitizeCachedFullSubject — generic fuzz (regression net for new fields)", () => {
	test("every Upstash corruption mode is recovered without leaving array payloads at object positions", () => {
		const populated = buildBaseCachedFullSubjectForSanitize() as unknown as Record<
			string,
			unknown
		>;
		populated.products = [
			{
				...buildBaseProductForSanitize("plan_sanitize_fuzz_1"),
				config: { ignore_past_due: true },
			},
			{
				...buildBaseProductForSanitize("plan_sanitize_fuzz_2"),
				config: { ignore_past_due: false },
			},
		];

		for (const mode of ALL_SANITIZER_CORRUPTION_MODES) {
			const corruptedProducts = (
				populated.products as Array<Record<string, unknown>>
			).map((p, i) => {
				const corruptedProduct = corruptAllFieldsForSanitizer(
					p,
					mode,
				) as Record<string, unknown>;
				return {
					...corruptedProduct,
					id: `plan_sanitize_fuzz_${i + 1}_${mode}`,
					internal_id: `ip_plan_sanitize_fuzz_${i + 1}_${mode}`,
				};
			});

			const corrupted: Record<string, unknown> = {
				...populated,
				products: corruptedProducts,
			};

			let sanitized: CachedFullSubject;
			expect(() => {
				sanitized = sanitizeCachedFullSubject({
					cachedFullSubject: corrupted as unknown as CachedFullSubject,
				});
			}).not.toThrow();

			expect(() =>
				assertNoArrayShapedObjects(
					sanitized!,
					CachedFullSubjectSchema as unknown as z.ZodTypeAny,
				),
			).not.toThrow();

			for (const product of (sanitized!.products ?? []) as Array<{
				config: unknown;
			}>) {
				expect(Array.isArray(product.config)).toBe(false);
				expect(typeof product.config).toBe("object");
				expect(product.config).not.toBeNull();
			}
		}
	});
});
