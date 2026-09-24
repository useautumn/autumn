import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { ATMN_APP_KEY_SCOPES, ErrCode } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthClientRepo } from "@/internal/auth/repos/index.js";
import {
	parseRequestedScopes,
	tokenRecordFromResourceToken,
	withAtmnAppKeyScopes,
} from "@/internal/dev/cli/oauthApiKeyUtils.js";

describe("oauthApiKeyUtils", () => {
	test("parses absent and valid requested scopes", () => {
		expect(parseRequestedScopes(undefined)).toBeNull();
		expect(parseRequestedScopes(["customers:read", "billing:write"])).toEqual([
			"customers:read",
			"billing:write",
		]);
	});

	test("rejects malformed requested scopes", () => {
		try {
			parseRequestedScopes(["customers:read", 1]);
			throw new Error("expected parseRequestedScopes to throw");
		} catch (error) {
			expect((error as { code?: string }).code).toBe(ErrCode.InvalidRequest);
		}
	});

	test("maps resource access token claims to an API-key token record", () => {
		expect(
			tokenRecordFromResourceToken({
				sub: "user_123",
				reference_id: "org_123",
				azp: "client_123",
				scope: "customers:read billing:write",
			}),
		).toEqual({
			userId: "user_123",
			referenceId: "org_123",
			clientId: "client_123",
			scopes: ["customers:read", "billing:write"],
		});
	});

	test("falls back to client_id when azp is absent", () => {
		expect(
			tokenRecordFromResourceToken({
				client_id: "client_456",
			}),
		).toMatchObject({
			clientId: "client_456",
			scopes: [],
		});
	});
});

describe("withAtmnAppKeyScopes", () => {
	afterEach(() => {
		mock.restore();
	});

	const cliScopes = ["organisation:read", "customers:write"];

	const dbWithRole = (role: string) =>
		({
			query: { member: { findFirst: async () => ({ role }) } },
		}) as unknown as DrizzleCli;

	const mockClient = ({ name }: { name: string }) =>
		spyOn(oauthClientRepo, "getByClientId").mockResolvedValue({
			id: "oauth_client",
			clientId: "client_123",
			name,
			redirectUris: ["http://localhost:31448/"],
			scopes: [],
			metadata: null,
			createdAt: new Date(),
		});

	const grant = ({
		db,
		requestedScopes = null,
	}: {
		db: DrizzleCli;
		requestedScopes?: string[] | null;
	}) =>
		withAtmnAppKeyScopes({
			db,
			clientId: "client_123",
			userId: "user_123",
			orgId: "org_123",
			apiKeyScopes: requestedScopes ?? cliScopes,
			requestedScopes,
		});

	test("adds the app scopes to atmn keys for a role that holds them", async () => {
		mockClient({ name: "atmn" });

		expect(await grant({ db: dbWithRole("developer") })).toEqual([
			...cliScopes,
			...ATMN_APP_KEY_SCOPES,
		]);
		expect(await grant({ db: dbWithRole("owner") })).toEqual([
			...cliScopes,
			...ATMN_APP_KEY_SCOPES,
		]);
	});

	test("caps the app scopes by the user's org role", async () => {
		mockClient({ name: "atmn" });

		expect(await grant({ db: dbWithRole("member") })).toEqual([
			...cliScopes,
			"analytics:read",
			"balances:read",
			"billing:read",
		]);
		expect(await grant({ db: dbWithRole("unknown_role") })).toEqual(cliScopes);
	});

	test("leaves non-atmn clients unchanged", async () => {
		mockClient({ name: "Third Party App" });

		expect(await grant({ db: dbWithRole("owner") })).toEqual(cliScopes);
	});

	test("mints exactly the explicitly requested scopes for atmn keys", async () => {
		mockClient({ name: "atmn" });
		const requestedScopes = ["customers:read"];

		const scopes = await grant({ db: dbWithRole("owner"), requestedScopes });

		expect(scopes).toEqual(requestedScopes);
		for (const scope of ATMN_APP_KEY_SCOPES) {
			expect(scopes).not.toContain(scope);
		}
	});

	test("adds the role-capped app scopes when no scopes are requested", async () => {
		mockClient({ name: "atmn" });

		expect(await grant({ db: dbWithRole("owner") })).toEqual([
			...cliScopes,
			...ATMN_APP_KEY_SCOPES,
		]);
	});
});
