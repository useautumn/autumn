import { describe, expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import {
	parseRequestedScopes,
	tokenRecordFromResourceToken,
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
