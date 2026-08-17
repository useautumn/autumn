import { describe, expect, test } from "bun:test";
import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND,
} from "@autumn/auth/oauth";
import { Scopes } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { OAuthAccessTokenRecord } from "@/internal/auth/oauth/oauthAccessTokenApiKey.js";
import { resolveIssuedOAuthScopes } from "@/internal/auth/oauth/token/resolveIssuedOAuthScopes.js";

const createConsentDb = ({ kind }: { kind?: string }) =>
	({
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => [{ metadata: kind ? { kind } : null }],
				}),
			}),
		}),
	}) as unknown as DrizzleCli;

const adminTokenRecord = ({ scopes }: { scopes: string[] }) =>
	({
		clientId: AUTUMN_ADMIN_OAUTH_CLIENT_ID,
		id: "oauth_access_1",
		oauthConsentId: "oauth_consent_1",
		referenceId: "org_1",
		scopes,
		userId: "user_1",
	}) as unknown as OAuthAccessTokenRecord;

describe("resolveIssuedOAuthScopes", () => {
	test("keeps the granted scopes when an admin token requests none", async () => {
		const issued = await resolveIssuedOAuthScopes({
			db: createConsentDb({}),
			isMcpClient: true,
			requestedScopes: [],
			tokenRecord: adminTokenRecord({ scopes: [Scopes.Customers.Read] }),
		});

		expect(issued).toEqual([Scopes.Customers.Read]);
	});

	test("narrows an admin token to the scopes it requested", async () => {
		const issued = await resolveIssuedOAuthScopes({
			db: createConsentDb({}),
			isMcpClient: true,
			requestedScopes: [Scopes.Plans.Read],
			tokenRecord: adminTokenRecord({
				scopes: [Scopes.Customers.Read, Scopes.Plans.Read],
			}),
		});

		expect(issued).toEqual([Scopes.Plans.Read]);
	});

	test("rejects a scope-less grant that no unrestricted chat consent backs", async () => {
		expect(
			resolveIssuedOAuthScopes({
				db: createConsentDb({ kind: "slack" }),
				isMcpClient: true,
				requestedScopes: null,
				tokenRecord: adminTokenRecord({ scopes: [] }),
			}),
		).rejects.toThrow("OAuth token has no scopes");
	});

	test("keeps the scope-less unrestricted chat token issuable", async () => {
		const issued = await resolveIssuedOAuthScopes({
			db: createConsentDb({ kind: UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND }),
			isMcpClient: true,
			requestedScopes: null,
			tokenRecord: adminTokenRecord({ scopes: [] }),
		});

		expect(issued).toEqual([]);
	});
});
