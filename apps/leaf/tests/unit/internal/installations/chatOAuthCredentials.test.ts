import { describe, expect, test } from "bun:test";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	resolveAgentScopes,
	scopeSetsEqual,
} from "../../../../src/internal/installations/actions/chatOAuthCredentialScopes.js";
import { getOAuthConsentMetadataKindFilter } from "../../../../src/internal/installations/actions/oauthConsentMetadata.js";

const dialect = new PgDialect();
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("chat OAuth credentials", () => {
	test("compares scopes as duplicate-safe sets", () => {
		expect(scopeSetsEqual(["read", "write"], ["read", "read"])).toBe(false);
		expect(scopeSetsEqual(["read"], ["read", "read"])).toBe(true);
		expect(scopeSetsEqual(["write", "read"], ["read", "write"])).toBe(true);
	});

	test("deduplicates resolved agent scopes before minting credentials", () => {
		const [scope] = DEFAULT_OAUTH_RESOURCE_SCOPES;
		if (!scope) throw new Error("Expected at least one default OAuth scope");

		expect(resolveAgentScopes([scope, scope])).toEqual([scope]);
	});

	test("looks up OAuth consents by exact metadata kind", () => {
		const render = (
			filter: ReturnType<typeof getOAuthConsentMetadataKindFilter>,
		) => dialect.sqlToQuery(sql`SELECT * FROM oauth_consent WHERE ${filter}`);

		const unrestricted = render(
			getOAuthConsentMetadataKindFilter({
				kind: "chat_unrestricted",
				chatInstallationId: "chat_inst_1",
				createdByUserId: "user_1",
			}),
		);
		expect(normalize(unrestricted.sql)).toContain(
			`"oauth_consent"."metadata"->>'kind' = $1 AND "oauth_consent"."metadata"->>'chatInstallationId' = $2 AND "oauth_consent"."metadata"->>'createdByUserId' = $3`,
		);
		expect(unrestricted.params).toEqual([
			"chat_unrestricted",
			"chat_inst_1",
			"user_1",
		]);

		const restricted = render(getOAuthConsentMetadataKindFilter({}));
		expect(normalize(restricted.sql)).toContain(
			`COALESCE("oauth_consent"."metadata"->>'kind', '') = ''`,
		);
		expect(restricted.params).toEqual([]);
	});
});
