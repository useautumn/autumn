import { describe, expect, test } from "bun:test";
import { ApiVersion, AppEnv } from "@autumn/shared";
import type {
	BaseApiCustomerV5,
	BaseApiEntityV2,
} from "@autumn/shared/publicApiSchemas";
import {
	BYOC_CACHE_API_VERSION,
	BYOC_CACHE_MAX_ENTRY_BYTES,
	ByocCacheEntrySchema,
	customerByocCacheKey,
	customerToCacheEntry,
	entityByocCacheKey,
	entityToCacheEntry,
} from "../../src/byoc.js";

const customer: BaseApiCustomerV5 = {
	id: "cus_1",
	name: null,
	email: null,
	created_at: 1,
	fingerprint: null,
	stripe_id: null,
	env: AppEnv.Sandbox,
	metadata: {},
	send_email_receipts: false,
	billing_controls: {},
	subscriptions: [],
	purchases: [],
	licenses: [],
	balances: {},
	flags: {},
};

const entity: BaseApiEntityV2 = {
	id: "ent_1",
	name: null,
	customer_id: "cus_1",
	feature_id: "seats",
	created_at: 1,
	env: AppEnv.Sandbox,
	subscriptions: [],
	purchases: [],
	balances: {},
	flags: {},
};

describe("cache keys", () => {
	test("carry the schema version and separate parts with dots", () => {
		expect(customerByocCacheKey({ customerId: "cus:1" })).toBe(
			"v1.customer.cus:1",
		);
		expect(entityByocCacheKey({ customerId: "cus:1", entityId: "ent_1" })).toBe(
			"v1.entity.cus:1.ent_1",
		);
	});
});

describe("an API object as a cache entry", () => {
	test("a customer is stored as the API renders it, under its key", () => {
		const { key, entry } = customerToCacheEntry({
			customerId: "cus_1",
			customer,
			logOffset: 812n,
			computedAt: 1_790_000_000_000,
		});
		expect(key).toBe("v1.customer.cus_1");
		expect(ByocCacheEntrySchema.parse(entry)).toEqual({
			schema_version: 1,
			api_version: "2.4.0",
			log_offset: "812",
			computed_at: 1_790_000_000_000,
			object: "customer",
			data: customer,
		});
	});

	test("an entity is keyed under its customer", () => {
		const { key, entry } = entityToCacheEntry({
			customerId: "cus_1",
			entityId: "ent_1",
			entity,
			logOffset: 3n,
			computedAt: 1,
		});
		expect(key).toBe("v1.entity.cus_1.ent_1");
		expect(ByocCacheEntrySchema.parse(entry).object).toBe("entity");
	});

	test("an object past the KV's value limit becomes an oversized marker", () => {
		const bulky = {
			...customer,
			metadata: { notes: "x".repeat(BYOC_CACHE_MAX_ENTRY_BYTES) },
		};
		const { entry } = customerToCacheEntry({
			customerId: "cus_1",
			customer: bulky,
			logOffset: 1n,
			computedAt: 1,
		});
		expect(entry).toEqual({
			schema_version: 1,
			api_version: "2.4.0",
			log_offset: "1",
			computed_at: 1,
			object: "oversized",
		});
	});

	test("every field the cache adds is snake_case, like the API object it wraps", () => {
		const { entry } = entityToCacheEntry({
			customerId: "cus_1",
			entityId: "ent_1",
			entity,
			logOffset: 1n,
			computedAt: 1,
		});
		for (const field of Object.keys(entry))
			expect(field).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
	});

	test("entries are rendered at the API's latest version", () => {
		expect(BYOC_CACHE_API_VERSION).toBe(ApiVersion.V2_4);
	});
});
