import { afterEach, describe, expect, test } from "bun:test";
import { MCP_CLIENT_KIND } from "@autumn/shared/utils/auth/oauthClientMetadata";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { isMcpOAuthClient } from "@/internal/auth/oauth/mcpOAuthScopes.js";

const originalInternalMcpClientId = process.env.INTERNAL_MCP_OAUTH_CLIENT_ID;

afterEach(() => {
	process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = originalInternalMcpClientId;
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

describe("isMcpOAuthClient", () => {
	test("matches dynamic clients registered with the mcp_client kind", async () => {
		const db = createFakeDb({ metadata: { kind: MCP_CLIENT_KIND } });

		expect(await isMcpOAuthClient({ clientId: "oauth_client_abc", db })).toBe(
			true,
		);
	});

	test("matches the legacy internal_mcp metadata kind the authorize path accepts", async () => {
		const db = createFakeDb({ metadata: { kind: "internal_mcp" } });

		expect(await isMcpOAuthClient({ clientId: "oauth_client_abc", db })).toBe(
			true,
		);
	});

	test("matches env-listed internal mcp client ids without a stored row", async () => {
		process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = "internal_one";

		expect(
			await isMcpOAuthClient({
				clientId: "internal_one",
				db: createFakeDb({}),
			}),
		).toBe(true);
	});

	test("does not classify unrelated clients as MCP clients", async () => {
		expect(
			await isMcpOAuthClient({
				clientId: "oauth_client_abc",
				db: createFakeDb({ metadata: { kind: "summer" } }),
			}),
		).toBe(false);
		expect(
			await isMcpOAuthClient({
				clientId: "oauth_client_abc",
				db: createFakeDb({}),
			}),
		).toBe(false);
	});
});
