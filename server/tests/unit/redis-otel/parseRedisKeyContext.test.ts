import { describe, expect, test } from "bun:test";
import { extractKey } from "@/external/redis/otel/instrumentRedis.js";
import { parseRedisKeyContext } from "@/external/redis/otel/parseRedisKeyContext.js";
import {
	buildFullSubjectBalanceKey,
	buildFullSubjectKey,
	buildFullSubjectViewEpochKey,
	buildSharedFullSubjectBalanceKey,
} from "@/internal/customers/cache/fullSubject/index.js";

describe("parseRedisKeyContext - FullSubject V2", () => {
	test("parses base subject key", () => {
		const key = buildFullSubjectKey({
			orgId: "org_abc",
			env: "sandbox",
			customerId: "cus_1",
		});
		expect(parseRedisKeyContext({ key })).toEqual({
			orgId: "org_abc",
			customerId: "cus_1",
			entityId: undefined,
			generation: "v2",
		});
	});

	test("parses entity-variant subject key", () => {
		const key = buildFullSubjectKey({
			orgId: "org_abc",
			env: "sandbox",
			customerId: "cus_1",
			entityId: "ent_42",
		});
		expect(parseRedisKeyContext({ key })).toEqual({
			orgId: "org_abc",
			customerId: "cus_1",
			entityId: "ent_42",
			generation: "v2",
		});
	});

	test("parses shared-balance key", () => {
		const key = buildSharedFullSubjectBalanceKey({
			orgId: "org_abc",
			env: "sandbox",
			customerId: "cus_1",
			featureId: "messages",
		});
		expect(parseRedisKeyContext({ key })).toEqual({
			orgId: "org_abc",
			customerId: "cus_1",
			entityId: undefined,
			generation: "v2",
		});
	});

	test("parses per-feature balance key", () => {
		const key = buildFullSubjectBalanceKey({
			orgId: "org_abc",
			env: "sandbox",
			customerId: "cus_1",
			featureId: "messages",
		});
		expect(parseRedisKeyContext({ key })).toEqual({
			orgId: "org_abc",
			customerId: "cus_1",
			entityId: undefined,
			generation: "v2",
		});
	});

	test("parses view-epoch key", () => {
		const key = buildFullSubjectViewEpochKey({
			orgId: "org_abc",
			env: "sandbox",
			customerId: "cus_1",
		});
		expect(parseRedisKeyContext({ key })).toEqual({
			orgId: "org_abc",
			customerId: "cus_1",
			entityId: undefined,
			generation: "v2",
		});
	});

	test("does not mis-extract customerId as orgId for entity keys with hyphenated ids", () => {
		const key = buildFullSubjectKey({
			orgId: "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt",
			env: "sandbox",
			customerId: "track-rollover2",
			entityId: "1",
		});
		const parsed = parseRedisKeyContext({ key });
		expect(parsed.orgId).toBe("org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt");
		expect(parsed.customerId).toBe("track-rollover2");
		expect(parsed.entityId).toBe("1");
		expect(parsed.generation).toBe("v2");
	});
});

describe("parseRedisKeyContext - V1 shapes (regression)", () => {
	test("parses {orgId}:env:customer:version:customerId", () => {
		expect(
			parseRedisKeyContext({
				key: "{org_abc}:sandbox:customer:v1:cus_1",
			}),
		).toEqual({
			orgId: "org_abc",
			customerId: "cus_1",
			entityId: undefined,
			generation: "v1",
		});
	});

	test("parses {orgId}:env:customer:...:entity:entityId", () => {
		expect(
			parseRedisKeyContext({
				key: "{org_abc}:sandbox:customer:v1:cus_1:entity:ent_42",
			}),
		).toEqual({
			orgId: "org_abc",
			customerId: "cus_1",
			entityId: "ent_42",
			generation: "v1",
		});
	});

	test("parses {orgId}:env:fullcustomer:version:customerId", () => {
		expect(
			parseRedisKeyContext({
				key: "{org_abc}:sandbox:fullcustomer:v1:cus_1",
			}),
		).toEqual({
			orgId: "org_abc",
			customerId: "cus_1",
			generation: "v1",
		});
	});

	test("parses {orgId}:env:customer_guard:customerId", () => {
		expect(
			parseRedisKeyContext({
				key: "{org_abc}:sandbox:customer_guard:cus_1",
			}),
		).toEqual({
			orgId: "org_abc",
			customerId: "cus_1",
			generation: "v1",
		});
	});

	test("parses {orgId}:env:test_cache_delete_guard:customerId", () => {
		expect(
			parseRedisKeyContext({
				key: "{org_abc}:sandbox:test_cache_delete_guard:cus_1",
			}),
		).toEqual({
			orgId: "org_abc",
			customerId: "cus_1",
			generation: "v1",
		});
	});

	test("tags unknown-kind hash-tagged keys as v1", () => {
		expect(
			parseRedisKeyContext({
				key: "{org_abc}:sandbox:some_other_kind:cus_1",
			}),
		).toEqual({
			orgId: "org_abc",
			generation: "v1",
		});
	});
});

describe("extractKey - numeric-first-arg custom commands", () => {
	test("uses args[1] as key when args[0] is the key count", () => {
		expect(
			extractKey({
				args: [3, "{cus_1}:org_abc:sandbox:full_subject", "k2", "k3", "arg"],
			}),
		).toBe("{cus_1}:org_abc:sandbox:full_subject");
	});

	test("uses args[0] when it is a string (commands with numberOfKeys)", () => {
		expect(
			extractKey({
				args: ["{cus_1}:org_abc:sandbox:full_subject", "arg1", "arg2"],
			}),
		).toBe("{cus_1}:org_abc:sandbox:full_subject");
	});

	test("falls back to undefined when args[1] is not a key", () => {
		expect(extractKey({ args: [0] })).toBeUndefined();
		expect(extractKey({ args: [] })).toBeUndefined();
	});

	test("handles Buffer keys", () => {
		expect(
			extractKey({
				args: [1, Buffer.from("{cus}:org:env:full_subject", "utf8")],
			}),
		).toBe("{cus}:org:env:full_subject");
	});
});

describe("parseRedisKeyContext - edge cases", () => {
	test("returns empty for undefined key", () => {
		expect(parseRedisKeyContext({ key: undefined })).toEqual({});
	});

	test("returns empty for short key", () => {
		expect(parseRedisKeyContext({ key: "foo:bar" })).toEqual({});
	});
});
