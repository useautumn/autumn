import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { OAuth2Tokens } from "arctic";

type MockOAuthState = {
	organization_slug: string;
	env: string;
	redirect_uri: string;
	master_org_id: string | null;
	code_verifier?: string;
	provider?: string;
	revenuecat_project_name?: string;
	migration?: boolean;
};

const mockConsumeOAuthState = mock(
	(): Promise<MockOAuthState | null> => Promise.resolve(null),
);
const mockExchangeRcCode = mock(() =>
	Promise.resolve(
		new OAuth2Tokens({
			access_token: "atk_new",
			token_type: "Bearer",
			expires_in: 3600,
			refresh_token: "rtk_new",
			scope:
				"project_configuration:projects:read_write customer_information:customers:read_write",
		}),
	),
);
const mockOrgGetBySlug = mock(
	(): Promise<Record<string, unknown> | null> => Promise.resolve(null),
);
const mockOrgUpdate = mock(
	(_args: { updates: any }): Promise<null> => Promise.resolve(null),
);
const mockClearOrgCache = mock((): Promise<void> => Promise.resolve());
const mockCreateProject = mock(() =>
	Promise.resolve({ id: "proj_123", name: "Test Project" }),
);
const mockListProjects = mock(
	(): Promise<{ projects: { id: string; name: string }[] }> =>
		Promise.resolve({ projects: [] }),
);
const mockListProductStoreIdentifiers = mock(
	(): Promise<Set<string>> => Promise.resolve(new Set<string>()),
);
const mockMappingsGetAll = mock(
	(): Promise<{ revenuecat_product_ids: string[] }[]> => Promise.resolve([]),
);

mock.module("@/db/initDrizzle.js", () => ({
	initDrizzle: () => ({ db: {} }),
}));

mock.module(
	"@/internal/platform/platformBeta/utils/oauthStateUtils.js",
	() => ({
		consumeOAuthState: mockConsumeOAuthState,
	}),
);

mock.module("@/external/revenueCat/misc/revenuecatOAuth.js", () => ({
	exchangeRcCode: mockExchangeRcCode,
	RC_OAUTH_SCOPES: [
		"project_configuration:projects:read_write",
		"customer_information:customers:read_write",
	],
	findMissingRcScopes: (granted: string[]) =>
		[
			"project_configuration:projects:read_write",
			"customer_information:customers:read_write",
		].filter(
			(required) =>
				!granted.some((g) => g === required || g === "*:*:read_write"),
		),
}));

mock.module("@/external/revenueCat/misc/initRevenuecatCli.js", () => ({
	initRevenuecatCli: () => ({
		createProject: mockCreateProject,
		listProducts: async () => [],
		listProjects: mockListProjects,
		listProductStoreIdentifiers: mockListProductStoreIdentifiers,
	}),
}));

mock.module("@/external/revenueCat/misc/RCMappingService.js", () => ({
	RCMappingService: { getAll: mockMappingsGetAll },
}));

mock.module("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		getBySlug: mockOrgGetBySlug,
		update: mockOrgUpdate,
	},
}));

mock.module("@/internal/orgs/orgUtils/clearOrgCache.js", () => ({
	clearOrgCache: mockClearOrgCache,
}));

const { handleRevenueCatOAuthCallback } = await import(
	"@/internal/orgs/handlers/revenueCatHandlers/handleRevenueCatOAuthCallback.js"
);

const createContext = (query: Record<string, string | undefined>) => {
	let redirectUrl = "";
	return {
		req: {
			query: () => query,
		},
		redirect: (url: string) => {
			redirectUrl = url;
			return { status: 302, location: url };
		},
		getRedirectUrl: () => redirectUrl,
	};
};

describe("handleRevenueCatOAuthCallback", () => {
	beforeEach(() => {
		process.env.CLIENT_URL = "http://localhost:5173";
		process.env.ENCRYPTION_PASSWORD = "test-encryption-password";
		mockConsumeOAuthState.mockClear();
		mockExchangeRcCode.mockClear();
		mockOrgGetBySlug.mockClear();
		mockOrgUpdate.mockClear();
		mockClearOrgCache.mockClear();
		mockCreateProject.mockClear();
		mockListProjects.mockClear();
		mockListProjects.mockResolvedValue({ projects: [] });
		mockListProductStoreIdentifiers.mockClear();
		mockListProductStoreIdentifiers.mockResolvedValue(new Set<string>());
		mockMappingsGetAll.mockClear();
		mockMappingsGetAll.mockResolvedValue([]);
	});

	afterEach(() => {
		delete process.env.CLIENT_URL;
		delete process.env.ENCRYPTION_PASSWORD;
	});

	test("redirects with error when OAuth provider returns error", async () => {
		const ctx = createContext({ error: "access_denied" });

		await handleRevenueCatOAuthCallback(ctx as never);

		expect(ctx.getRedirectUrl()).toContain("error=access_denied");
		expect(ctx.getRedirectUrl()).toContain("tab=revenuecat");
	});

	test("redirects with missing_parameters when code or state absent", async () => {
		const ctx = createContext({ code: "abc" });

		await handleRevenueCatOAuthCallback(ctx as never);

		expect(ctx.getRedirectUrl()).toContain("error=missing_parameters");
	});

	test("redirects with invalid_state when redis state is missing", async () => {
		mockConsumeOAuthState.mockResolvedValueOnce(null);
		const ctx = createContext({ code: "abc", state: "state_123" });

		await handleRevenueCatOAuthCallback(ctx as never);

		expect(ctx.getRedirectUrl()).toContain("error=invalid_state");
	});

	test("redirects with success and updates org on happy path (dashboard flow)", async () => {
		mockConsumeOAuthState.mockResolvedValueOnce({
			organization_slug: "test-org",
			env: "sandbox",
			redirect_uri: "http://localhost:5173/dev?tab=revenuecat",
			master_org_id: null,
			code_verifier: "verifier_123",
			provider: "revenuecat",
		});
		mockOrgGetBySlug.mockResolvedValueOnce({
			id: "org_123",
			slug: "test-org",
			processor_configs: {
				revenuecat: {
					webhook_secret: "whsec",
					sandbox_webhook_secret: "whsec_sandbox",
				},
			},
		});

		const ctx = createContext({ code: "abc", state: "state_123" });

		await handleRevenueCatOAuthCallback(ctx as never);

		expect(mockExchangeRcCode).toHaveBeenCalledWith({
			code: "abc",
			codeVerifier: "verifier_123",
		});
		expect(mockOrgUpdate).toHaveBeenCalledTimes(1);
		expect(mockClearOrgCache).toHaveBeenCalledTimes(1);
		expect(ctx.getRedirectUrl()).toContain("success=true");
	});

	test("platform flow: rejects when org.created_by does not match master_org_id", async () => {
		mockConsumeOAuthState.mockResolvedValueOnce({
			organization_slug: "test-org",
			env: "sandbox",
			redirect_uri: "https://platform.example.com/callback",
			master_org_id: "master_123",
			code_verifier: "verifier_123",
			provider: "revenuecat",
			revenuecat_project_name: "Test Project",
		});
		mockOrgGetBySlug.mockResolvedValueOnce({
			id: "org_123",
			slug: "test-org",
			created_by: "other_master",
			processor_configs: {},
		});

		const ctx = createContext({ code: "abc", state: "state_123" });

		await handleRevenueCatOAuthCallback(ctx as never);

		expect(mockExchangeRcCode).not.toHaveBeenCalled();
		expect(mockOrgUpdate).not.toHaveBeenCalled();
		expect(ctx.getRedirectUrl()).toContain("success=false");
		expect(ctx.getRedirectUrl()).toContain("provider=revenuecat");
		expect(ctx.getRedirectUrl()).toContain("message=org_permission_denied");
	});

	test("platform flow: creates project, persists config, and redirects with project id", async () => {
		mockConsumeOAuthState.mockResolvedValueOnce({
			organization_slug: "test-org",
			env: "sandbox",
			redirect_uri: "https://platform.example.com/callback",
			master_org_id: "master_123",
			code_verifier: "verifier_123",
			provider: "revenuecat",
			revenuecat_project_name: "Test Project",
		});
		mockOrgGetBySlug.mockResolvedValueOnce({
			id: "org_123",
			slug: "test-org",
			created_by: "master_123",
			processor_configs: {},
		});

		const ctx = createContext({ code: "abc", state: "state_123" });

		await handleRevenueCatOAuthCallback(ctx as never);

		expect(mockExchangeRcCode).toHaveBeenCalledWith({
			code: "abc",
			codeVerifier: "verifier_123",
		});
		expect(mockCreateProject).toHaveBeenCalledWith({ name: "Test Project" });
		expect(mockOrgUpdate).toHaveBeenCalledTimes(1);
		expect(mockClearOrgCache).toHaveBeenCalledTimes(1);
		const updateCall = mockOrgUpdate.mock.calls[0]?.[0];
		const sandboxOauth =
			updateCall?.updates.processor_configs?.revenuecat?.sandbox_oauth;
		expect(sandboxOauth?.project_id).toBe("proj_123");
		// platform org had no webhook secret → callback generates + persists one
		const rc = updateCall?.updates.processor_configs?.revenuecat;
		expect(typeof rc?.sandbox_webhook_secret).toBe("string");
		expect(rc?.sandbox_webhook_secret?.length).toBe(64);
		expect(ctx.getRedirectUrl()).toContain("success=true");
		expect(ctx.getRedirectUrl()).toContain("provider=revenuecat");
		expect(ctx.getRedirectUrl()).toContain("organization_slug=test-org");
		expect(ctx.getRedirectUrl()).toContain("env=test");
		expect(ctx.getRedirectUrl()).toContain("revenuecat_project_id=proj_123");
	});

	test("platform flow: redirects with error when project creation fails", async () => {
		mockConsumeOAuthState.mockResolvedValueOnce({
			organization_slug: "test-org",
			env: "sandbox",
			redirect_uri: "https://platform.example.com/callback",
			master_org_id: "master_123",
			code_verifier: "verifier_123",
			provider: "revenuecat",
			revenuecat_project_name: "Test Project",
		});
		mockOrgGetBySlug.mockResolvedValueOnce({
			id: "org_123",
			slug: "test-org",
			created_by: "master_123",
			processor_configs: {},
		});
		mockCreateProject.mockRejectedValueOnce(new Error("RC API error"));

		const ctx = createContext({ code: "abc", state: "state_123" });

		await handleRevenueCatOAuthCallback(ctx as never);

		expect(mockOrgUpdate).not.toHaveBeenCalled();
		expect(ctx.getRedirectUrl()).toContain("success=false");
		expect(ctx.getRedirectUrl()).toContain("provider=revenuecat");
		expect(ctx.getRedirectUrl()).toContain("message=RC+API+error");
	});

	// ── API-key → OAuth migration ────────────────────────────────────────────
	const migrationState = (): MockOAuthState => ({
		organization_slug: "test-org",
		env: "sandbox",
		redirect_uri: "http://localhost:5173/dev?tab=revenuecat",
		master_org_id: null,
		code_verifier: "verifier_123",
		provider: "revenuecat",
		migration: true,
	});

	const legacyApiKeyOrg = () => ({
		id: "org_123",
		slug: "test-org",
		processor_configs: {
			revenuecat: {
				sandbox_api_key: "enc_sandbox_key",
				sandbox_project_id: "proj_existing",
				sandbox_webhook_secret: "whsec_sandbox",
			},
		},
	});

	test("migration: connects OAuth, keeps the project, and strips the legacy api key", async () => {
		mockConsumeOAuthState.mockResolvedValueOnce(migrationState());
		mockOrgGetBySlug.mockResolvedValueOnce(legacyApiKeyOrg());
		mockListProjects.mockResolvedValueOnce({
			projects: [{ id: "proj_existing", name: "Existing" }],
		});
		mockMappingsGetAll.mockResolvedValueOnce([
			{ revenuecat_product_ids: ["com.app.pro", "com.app.premium"] },
		]);
		mockListProductStoreIdentifiers.mockResolvedValueOnce(
			new Set(["com.app.pro", "com.app.premium", "com.app.extra"]),
		);

		const ctx = createContext({ code: "abc", state: "state_123" });
		await handleRevenueCatOAuthCallback(ctx as never);

		expect(mockOrgUpdate).toHaveBeenCalledTimes(1);
		const rc =
			mockOrgUpdate.mock.calls[0]?.[0]?.updates.processor_configs?.revenuecat;
		// OAuth connected against the existing project
		expect(rc?.sandbox_oauth?.project_id).toBe("proj_existing");
		// legacy api key + project id stripped
		expect(rc?.sandbox_api_key).toBeUndefined();
		expect(rc?.sandbox_project_id).toBeUndefined();
		// untouched legacy fields preserved
		expect(rc?.sandbox_webhook_secret).toBe("whsec_sandbox");
		expect(ctx.getRedirectUrl()).toContain("success=true");
	});

	test("migration: blocks when the OAuth account doesn't contain the project", async () => {
		mockConsumeOAuthState.mockResolvedValueOnce(migrationState());
		mockOrgGetBySlug.mockResolvedValueOnce(legacyApiKeyOrg());
		mockListProjects.mockResolvedValueOnce({
			projects: [{ id: "some_other_project", name: "Other" }],
		});

		const ctx = createContext({ code: "abc", state: "state_123" });
		await handleRevenueCatOAuthCallback(ctx as never);

		expect(mockOrgUpdate).not.toHaveBeenCalled();
		expect(ctx.getRedirectUrl()).toContain("error=project_not_in_account");
	});

	test("migration: blocks when mapped products aren't all in the project", async () => {
		mockConsumeOAuthState.mockResolvedValueOnce(migrationState());
		mockOrgGetBySlug.mockResolvedValueOnce(legacyApiKeyOrg());
		mockListProjects.mockResolvedValueOnce({
			projects: [{ id: "proj_existing", name: "Existing" }],
		});
		mockMappingsGetAll.mockResolvedValueOnce([
			{ revenuecat_product_ids: ["com.app.pro", "com.app.missing"] },
		]);
		mockListProductStoreIdentifiers.mockResolvedValueOnce(
			new Set(["com.app.pro"]),
		);

		const ctx = createContext({ code: "abc", state: "state_123" });
		await handleRevenueCatOAuthCallback(ctx as never);

		expect(mockOrgUpdate).not.toHaveBeenCalled();
		expect(ctx.getRedirectUrl()).toContain("error=products_mismatch");
	});

	test("migration: blocks when there is no existing project id", async () => {
		mockConsumeOAuthState.mockResolvedValueOnce(migrationState());
		mockOrgGetBySlug.mockResolvedValueOnce({
			id: "org_123",
			slug: "test-org",
			processor_configs: { revenuecat: { sandbox_api_key: "enc_key" } },
		});

		const ctx = createContext({ code: "abc", state: "state_123" });
		await handleRevenueCatOAuthCallback(ctx as never);

		expect(mockOrgUpdate).not.toHaveBeenCalled();
		expect(ctx.getRedirectUrl()).toContain("error=no_project_to_migrate");
	});
});
