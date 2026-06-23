import { describe, expect, test } from "bun:test";
import { AppEnv, ErrCode, RecaseError, Scopes } from "@autumn/shared";
import {
	assertSandboxAccess,
	SANDBOX_ORG_HEADER,
} from "@/honoMiddlewares/sandboxAccess.js";

const MAIN_ORG = "org_main";
const SANDBOX_ORG = "org_sandbox";

const validCandidate = {
	id: SANDBOX_ORG,
	created_by: MAIN_ORG,
	is_sandbox: true,
};

const call = (
	overrides: Partial<Parameters<typeof assertSandboxAccess>[0]> = {},
) =>
	assertSandboxAccess({
		sessionOrgId: MAIN_ORG,
		sandboxOrgId: SANDBOX_ORG,
		candidate: validCandidate,
		appEnv: AppEnv.Sandbox,
		scopes: [Scopes.Platform.Write],
		...overrides,
	});

describe("assertSandboxAccess (the multi-sandbox tenant-isolation spine)", () => {
	test("the header name is x-sandbox-org-id", () => {
		expect(SANDBOX_ORG_HEADER).toBe("x-sandbox-org-id");
	});

	test("allows an owned, sandbox-marked sub-org with platform:write", () => {
		expect(() => call()).not.toThrow();
	});

	test("owner scope expands to platform:write and is allowed", () => {
		expect(() => call({ scopes: ["owner"] })).not.toThrow();
	});

	test("rejects a foreign sandbox (created_by != session org)", () => {
		expect(() =>
			call({ candidate: { ...validCandidate, created_by: "org_attacker" } }),
		).toThrow();
	});

	test("rejects created_by = null (orphan/legacy org)", () => {
		expect(() =>
			call({ candidate: { ...validCandidate, created_by: null } }),
		).toThrow();
	});

	test("rejects a member with only platform:read", () => {
		expect(() => call({ scopes: [Scopes.Platform.Read] })).toThrow();
	});

	test("rejects empty scopes (no fail-open in the resolver)", () => {
		expect(() => call({ scopes: [] })).toThrow();
	});

	test("rejects a non-sandbox org with is_sandbox=false", () => {
		expect(() =>
			call({ candidate: { ...validCandidate, is_sandbox: false } }),
		).toThrow();
	});

	test("rejects an org with no sandbox marker", () => {
		expect(() =>
			call({ candidate: { id: SANDBOX_ORG, created_by: MAIN_ORG } }),
		).toThrow();
	});

	test("rejects a missing candidate org", () => {
		expect(() => call({ candidate: null })).toThrow();
	});

	test("rejects resolving to the session org itself", () => {
		expect(() =>
			call({ candidate: { ...validCandidate, id: MAIN_ORG } }),
		).toThrow();
	});

	test("rejects app_env=live targeting a sandbox", () => {
		expect(() => call({ appEnv: AppEnv.Live })).toThrow();
	});

	test("superuser can access an owned sandbox", () => {
		expect(() => call({ scopes: ["superuser"] })).not.toThrow();
	});

	test("superuser still cannot cross created_by to a foreign sandbox", () => {
		expect(() =>
			call({
				scopes: ["superuser"],
				candidate: { ...validCandidate, created_by: "org_attacker" },
			}),
		).toThrow();
	});
});

describe("assertSandboxAccess rejection codes + precedence (leak guard)", () => {
	const expectReject = (
		overrides: Partial<Parameters<typeof assertSandboxAccess>[0]>,
		code: string,
		statusCode: number,
	) => {
		let err: unknown;
		try {
			call(overrides);
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(RecaseError);
		expect((err as RecaseError).code).toBe(code);
		expect((err as RecaseError).statusCode).toBe(statusCode);
	};

	test("insufficient scope -> InsufficientScopes / 403", () => {
		expectReject(
			{ scopes: [Scopes.Platform.Read] },
			ErrCode.InsufficientScopes,
			403,
		);
	});

	test("app_env=live -> InvalidRequest / 400", () => {
		expectReject({ appEnv: AppEnv.Live }, ErrCode.InvalidRequest, 400);
	});

	test("missing candidate -> OrgNotFound / 404", () => {
		expectReject({ candidate: null }, ErrCode.OrgNotFound, 404);
	});

	test("resolving to the session org -> OrgNotFound / 404", () => {
		expectReject(
			{ candidate: { ...validCandidate, id: MAIN_ORG } },
			ErrCode.OrgNotFound,
			404,
		);
	});

	test("foreign sandbox -> OrgNotFound / 404", () => {
		expectReject(
			{ candidate: { ...validCandidate, created_by: "org_attacker" } },
			ErrCode.OrgNotFound,
			404,
		);
	});

	test("non-sandbox org -> OrgNotFound / 404", () => {
		expectReject(
			{ candidate: { ...validCandidate, is_sandbox: false } },
			ErrCode.OrgNotFound,
			404,
		);
	});

	// A scoped caller must not be able to tell "this id doesn't exist" from
	// "exists but isn't yours" from "exists but isn't a sandbox": every target
	// resolution failure returns the same 404 + message.
	test("missing, self, foreign, and non-sandbox return one identical 404 (no oracle)", () => {
		const messages = [
			{ candidate: null },
			{ candidate: { ...validCandidate, id: MAIN_ORG } },
			{ candidate: { ...validCandidate, created_by: "org_attacker" } },
			{ candidate: { ...validCandidate, is_sandbox: false } },
		].map((overrides) => {
			try {
				call(overrides);
			} catch (e) {
				return (e as RecaseError).message;
			}
			return "DID_NOT_THROW";
		});
		expect(new Set(messages).size).toBe(1);
		expect(messages[0]).toBe("Sandbox not found");
	});

	// Scopes are checked FIRST, so an under-scoped caller cannot use the response
	// to learn whether a sandbox id exists or who owns it.
	test("under-scoped + nonexistent id -> scopes error first (no existence oracle)", () => {
		expectReject(
			{ scopes: [], candidate: null },
			ErrCode.InsufficientScopes,
			403,
		);
	});

	test("under-scoped + foreign id -> scopes error first (no ownership oracle)", () => {
		expectReject(
			{
				scopes: [],
				candidate: { ...validCandidate, created_by: "org_attacker" },
			},
			ErrCode.InsufficientScopes,
			403,
		);
	});
});
