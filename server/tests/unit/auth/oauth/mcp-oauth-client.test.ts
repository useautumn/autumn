import { afterEach, describe, expect, test } from "bun:test";
import {
	isMcpOAuthClientRecord,
	isReservedMcpOAuthClientId,
} from "@autumn/auth/oauth";
import { MCP_CLIENT_KIND } from "@autumn/shared/utils/auth/oauthClientMetadata";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { isMcpOAuthClient as isMcpOAuthClientFromDb } from "@/internal/auth/oauth/mcpOAuthScopes.js";

const originalInternalMcpClientId = process.env.INTERNAL_MCP_OAUTH_CLIENT_ID;

afterEach(() => {
	process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = originalInternalMcpClientId;
});

describe("isReservedMcpOAuthClientId", () => {
	test("matches env-configured internal-mcp client ids", () => {
		process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = "internal_one, internal_two";

		expect(isReservedMcpOAuthClientId({ clientId: "internal_one" })).toBe(true);
		expect(isReservedMcpOAuthClientId({ clientId: "internal_two" })).toBe(true);
		expect(isReservedMcpOAuthClientId({ clientId: "oauth_client_other" })).toBe(
			false,
		);
		expect(isReservedMcpOAuthClientId({ clientId: null })).toBe(false);
	});
});

describe("isMcpOAuthClientRecord", () => {
	test("matches dynamic clients by mcp_client metadata kind", () => {
		expect(
			isMcpOAuthClientRecord({
				clientId: "oauth_client_abc",
				metadata: { kind: MCP_CLIENT_KIND },
			}),
		).toBe(true);
		expect(
			isMcpOAuthClientRecord({
				clientId: "oauth_client_abc",
				metadata: '{"kind":"mcp_client"}',
			}),
		).toBe(true);
	});

	test("matches the legacy internal_mcp metadata kind", () => {
		expect(
			isMcpOAuthClientRecord({
				clientId: "oauth_client_abc",
				metadata: { kind: "internal_mcp" },
			}),
		).toBe(true);
	});

	test("does not match reserved or unrelated clients", () => {
		expect(
			isMcpOAuthClientRecord({
				clientId: "autumn_summer",
				metadata: { kind: "summer" },
			}),
		).toBe(false);
		expect(
			isMcpOAuthClientRecord({ clientId: "oauth_client_abc", metadata: null }),
		).toBe(false);
	});

	test("matches the env-configured internal-mcp id without metadata", () => {
		process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = "internal_one";

		expect(isMcpOAuthClientRecord({ clientId: "internal_one" })).toBe(true);
	});
});

const createFakeDb = ({ metadata }: { metadata?: unknown }) =>
	({
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () =>
						metadata === undefined ? [] : [{ clientId: "c", metadata }],
				}),
			}),
		}),
	}) as unknown as DrizzleCli;

// Kind-matching matrix is pinned above; here only the db-backed delegation.
describe("isMcpOAuthClient (server, db-backed)", () => {
	test("classifies from the stored client row", async () => {
		const db = createFakeDb({ metadata: { kind: MCP_CLIENT_KIND } });

		expect(
			await isMcpOAuthClientFromDb({ clientId: "oauth_client_abc", db }),
		).toBe(true);
	});

	test("matches env-listed internal mcp client ids without a stored row", async () => {
		process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = "internal_one";

		expect(
			await isMcpOAuthClientFromDb({
				clientId: "internal_one",
				db: createFakeDb({}),
			}),
		).toBe(true);
	});

	test("does not classify unrelated or missing clients as MCP clients", async () => {
		expect(
			await isMcpOAuthClientFromDb({
				clientId: "oauth_client_abc",
				db: createFakeDb({ metadata: { kind: "summer" } }),
			}),
		).toBe(false);
		expect(
			await isMcpOAuthClientFromDb({
				clientId: "oauth_client_abc",
				db: createFakeDb({}),
			}),
		).toBe(false);
	});
});
