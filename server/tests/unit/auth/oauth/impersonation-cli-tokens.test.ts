import { describe, expect, test } from "bun:test";
import { AUTUMN_ADMIN_OAUTH_CLIENT_ID } from "@autumn/auth/oauth";
import {
	AppEnv,
	oauthAccessToken,
	oauthConsent,
	oauthRefreshToken,
} from "@autumn/shared";
import { hashOAuthToken } from "@autumn/shared/utils/auth/oauthAccessTokens";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	createImpersonationCliTokens,
	IMPERSONATION_CLI_CONSENT_KIND,
} from "@/internal/admin/impersonation/createImpersonationCliTokens.js";

type Row = Record<string, unknown>;

/** Records every insert per table, no real db. */
const createFakeDb = () => {
	const rows = new Map<unknown, Row[]>();
	const insert = (table: unknown) => ({
		values: async (values: Row) => {
			const existing = rows.get(table) ?? [];
			rows.set(table, [...existing, values]);
		},
	});
	const db = {
		insert,
		transaction: async (run: (tx: unknown) => Promise<void>) => run({ insert }),
	} as unknown as DrizzleCli;
	return { db, rows };
};

describe("createImpersonationCliTokens", () => {
	test("mints one sandbox and one live token on the admin client, no refresh row", async () => {
		const { db, rows } = createFakeDb();
		const before = Date.now();

		const result = await createImpersonationCliTokens({
			db,
			impersonatedBy: "user_staff",
			orgId: "org_customer",
			scopes: ["plans:write"],
			userId: "user_customer",
		});

		const consents = rows.get(oauthConsent) ?? [];
		const tokens = rows.get(oauthAccessToken) ?? [];
		expect(rows.get(oauthRefreshToken)).toBeUndefined();
		expect(consents.map((c) => c.env)).toEqual([AppEnv.Sandbox, AppEnv.Live]);
		expect(tokens).toHaveLength(2);

		for (const consent of consents) {
			expect(consent.clientId).toBe(AUTUMN_ADMIN_OAUTH_CLIENT_ID);
			expect(consent.referenceId).toBe("org_customer");
			expect(consent.userId).toBe("user_customer");
			expect(consent.metadata).toEqual({
				kind: IMPERSONATION_CLI_CONSENT_KIND,
				impersonatedBy: "user_staff",
			});
		}

		// Stored hashed; the caller gets the prefixed raw token.
		expect(result.sandboxToken).toStartWith("am_oauth_");
		expect(tokens[0]?.token).toBe(
			hashOAuthToken(result.sandboxToken.replace(/^am_oauth_/, "")),
		);
		expect(tokens[0]?.oauthConsentId).toBe(consents[0]?.id);
		expect(tokens[1]?.oauthConsentId).toBe(consents[1]?.id);

		const ttlMs = result.expiresAt.getTime() - before;
		expect(ttlMs).toBeGreaterThan(59 * 60 * 1000);
		expect(ttlMs).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
	});
});
