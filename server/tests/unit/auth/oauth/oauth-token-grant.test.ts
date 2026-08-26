import { describe, expect, test } from "bun:test";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { persistOAuthTokenGrant } from "@/internal/auth/oauth/token/persistOAuthTokenGrant.js";

describe("persistOAuthTokenGrant", () => {
	test("binds only the access token to a named sandbox", async () => {
		const updates: Record<string, unknown>[] = [];
		const tx = {
			update: () => ({
				set: (values: Record<string, unknown>) => {
					updates.push(values);
					return { where: async () => undefined };
				},
			}),
		};
		const db = {
			transaction: async (run: (db: typeof tx) => Promise<void>) => run(tx),
		} as unknown as DrizzleCli;

		await persistOAuthTokenGrant({
			accessTokenId: "access_token",
			db,
			oauthConsentId: "consent",
			referenceId: "sandbox_org",
			refreshTokenId: "refresh_token",
			resource: "https://api.example.com/mcp",
			scopes: ["customers:read"],
		});

		expect(updates).toHaveLength(2);
		expect(updates[0]?.referenceId).toBe("sandbox_org");
		expect(updates[1]?.referenceId).toBeUndefined();
	});
});
