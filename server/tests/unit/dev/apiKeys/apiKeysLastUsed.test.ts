/**
 * "Last used" for secret API keys, read from request logs in Axiom (no DB writes).
 *
 * Contract:
 *   1. getApiKeyVerificationData returns the key's row id as `apiKeyId`,
 *      so the auth middleware can log it on every request.
 *   2. buildApiKeysLastUsedQuery scopes to org + env + last 7 days and
 *      returns max(_time) per `context.api_key_id`.
 *   3. getApiKeysLastUsed maps Axiom rows to { [apiKeyId]: epochMs }.
 *   4. getApiKeysLastUsed returns {} when Axiom isn't configured.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const realInitAxiom = { ...(await import("@/external/axiom/initAxiom.js")) };
const realQueryAxiom = { ...(await import("@/external/axiom/queryAxiom.js")) };
const realOrgRepo = { ...(await import("@/internal/orgs/repos/index.js")) };

let axiomConfigured = true;
let axiomRows: Record<string, unknown>[] = [];
let lastQuery: { apl: string; options?: unknown } | null = null;

mock.module("@/external/axiom/initAxiom.js", () => ({
	...realInitAxiom,
	isAxiomConfigured: () => axiomConfigured,
}));

mock.module("@/external/axiom/queryAxiom.js", () => ({
	...realQueryAxiom,
	queryAxiomTabular: async (params: { apl: string; options?: unknown }) => {
		lastQuery = params;
		return axiomRows;
	},
}));

mock.module("@/internal/orgs/repos/index.js", () => ({
	orgRepo: {
		...realOrgRepo.orgRepo,
		findFull: async () => ({
			org: { id: "org_1", slug: "acme" },
			features: [],
			pendingMigrations: [],
			fullOrg: { id: "org_1" },
		}),
	},
}));

afterAll(() => {
	mock.module("@/external/axiom/initAxiom.js", () => realInitAxiom);
	mock.module("@/external/axiom/queryAxiom.js", () => realQueryAxiom);
	mock.module("@/internal/orgs/repos/index.js", () => realOrgRepo);
});

const { buildApiKeysLastUsedQuery } = await import(
	"@/external/axiom/utils/aplUtils.js"
);
const { getApiKeysLastUsed } = await import(
	"@/internal/dev/apiKeys/actions/getApiKeysLastUsed.js"
);
const { getApiKeyVerificationData } = await import(
	"@/internal/dev/repos/getApiKeyVerificationData.js"
);

const ctx = {
	org: { id: "org_1", slug: "acme" },
	env: "sandbox",
} as never;

beforeEach(() => {
	axiomConfigured = true;
	axiomRows = [];
	lastQuery = null;
});

describe("api key last used", () => {
	test("verification data includes the api key id", async () => {
		const db = {
			query: {
				apiKeys: {
					findFirst: async () => ({
						id: "key_abc",
						org_id: "org_1",
						user_id: null,
						user: null,
						scopes: null,
					}),
				},
			},
		} as never;

		const data = await getApiKeyVerificationData({
			db,
			hashedKey: "hash",
			env: "sandbox" as never,
		});

		expect(data?.apiKeyId).toBe("key_abc");
	});

	test("query scopes to org, env and the last 7 days, grouped by key id", () => {
		const apl = buildApiKeysLastUsedQuery({ orgId: "org_1", env: "sandbox" });

		expect(apl).toContain("['express']");
		expect(apl).toContain("_time > ago(7d)");
		expect(apl).toContain("['context.org_id'] == 'org_1'");
		expect(apl).toContain("['context.env'] == 'sandbox'");
		expect(apl).toContain(
			"summarize last_used = max(_time) by api_key_id = tostring(['context.api_key_id'])",
		);
	});

	test("query escapes quotes in org id", () => {
		const apl = buildApiKeysLastUsedQuery({ orgId: "o'1", env: "live" });
		expect(apl).toContain("['context.org_id'] == 'o\\'1'");
	});

	test("maps axiom rows to epoch ms per key", async () => {
		axiomRows = [
			{ api_key_id: "key_a", last_used: "2026-09-29T10:00:00Z" },
			{ api_key_id: "key_b", last_used: "2026-09-28T09:30:00.123Z" },
			{ api_key_id: "", last_used: "2026-09-28T09:30:00Z" },
		];

		const lastUsed = await getApiKeysLastUsed({ ctx });

		expect(lastUsed).toEqual({
			key_a: Date.parse("2026-09-29T10:00:00Z"),
			key_b: Date.parse("2026-09-28T09:30:00.123Z"),
		});
		expect(lastQuery?.apl).toContain("['context.org_id'] == 'org_1'");
	});

	test("accepts nanosecond epoch timestamps", async () => {
		axiomRows = [{ api_key_id: "key_a", last_used: 1790710284920088000 }];

		expect(await getApiKeysLastUsed({ ctx })).toEqual({
			key_a: 1790710284920,
		});
	});

	test("returns empty map when axiom is not configured", async () => {
		axiomConfigured = false;
		axiomRows = [{ api_key_id: "key_a", last_used: "2026-09-29T10:00:00Z" }];

		expect(await getApiKeysLastUsed({ ctx })).toEqual({});
		expect(lastQuery).toBeNull();
	});
});
