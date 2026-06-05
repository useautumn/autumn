import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockValidatePlatformOrg = mock(
	(): Promise<Record<string, unknown>> =>
		Promise.resolve({
			id: "org_123",
			slug: "test-org",
			processor_configs: {},
		}),
);

const mockGenerateOAuthState = mock(
	(): Promise<string> => Promise.resolve("state_123"),
);

const mockCreateRcAuthorizationUrl = mock(
	(): URL =>
		new URL("https://api.revenuecat.com/oauth2/authorize?state=state_123"),
);

mock.module(
	"@/internal/platform/platformBeta/utils/validatePlatformOrg.js",
	() => ({
		validatePlatformOrg: mockValidatePlatformOrg,
	}),
);

mock.module(
	"@/internal/platform/platformBeta/utils/oauthStateUtils.js",
	() => ({
		generateOAuthState: mockGenerateOAuthState,
	}),
);

mock.module("@/external/revenueCat/misc/revenuecatOAuth.js", () => ({
	createRcAuthorizationUrl: mockCreateRcAuthorizationUrl,
	generateCodeVerifier: () => "test-verifier",
}));

const { handleLinkRevenueCat } = await import(
	"@/internal/platform/platformBeta/handlers/handleLinkRevenueCat.js"
);

const handler = handleLinkRevenueCat[handleLinkRevenueCat.length - 1] as (
	c: any,
) => Promise<any>;

const createContext = (body: Record<string, unknown>) => {
	let jsonResponse: unknown = null;
	return {
		req: {
			valid: () => body,
			query: () => ({}),
		},
		json: (data: unknown) => {
			jsonResponse = data;
			return { status: 200 };
		},
		getJsonResponse: () => jsonResponse,
		set: () => {},
		get: () => ({
			db: {},
			org: { id: "master_org_123", slug: "master-org" },
			logger: { info: () => {}, error: () => {} },
		}),
	};
};

describe("handleLinkRevenueCat", () => {
	beforeEach(() => {
		process.env.REVENUECAT_OAUTH_CLIENT_ID = "rc_client";
		process.env.REVENUECAT_OAUTH_CLIENT_SECRET = "rc_secret";
		process.env.BETTER_AUTH_URL = "https://auth.example.com";
		mockValidatePlatformOrg.mockClear();
		mockGenerateOAuthState.mockClear();
		mockCreateRcAuthorizationUrl.mockClear();
	});

	test("errors when RevenueCat is already linked for env", async () => {
		mockValidatePlatformOrg.mockResolvedValueOnce({
			id: "org_123",
			slug: "test-org",
			processor_configs: {
				revenuecat: {
					sandbox_oauth: {
						access_token: "encrypted",
						refresh_token: "encrypted",
						expires_at: Date.now() + 3600000,
					},
				},
			},
		});

		const ctx = createContext({
			organization_slug: "test-org",
			env: "test",
			project_name: "My Project",
			redirect_url: "http://localhost:5173/callback",
		});

		await expect(handler(ctx as never)).rejects.toThrow();
	});

	test("returns oauth_url and stores state with revenuecat_project_name", async () => {
		mockValidatePlatformOrg.mockResolvedValueOnce({
			id: "org_123",
			slug: "test-org",
			processor_configs: {},
		});

		const ctx = createContext({
			organization_slug: "test-org",
			env: "test",
			project_name: "My Project",
			redirect_url: "http://localhost:5173/callback",
		});

		await handler(ctx as never);

		expect(mockGenerateOAuthState).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationSlug: "test-org",
				env: "sandbox",
				redirectUri: "http://localhost:5173/callback",
				masterOrgId: "master_org_123",
				provider: "revenuecat",
				revenuecatProjectName: "My Project",
			}),
		);
		expect(mockCreateRcAuthorizationUrl).toHaveBeenCalledWith(
			expect.objectContaining({
				state: "state_123",
				codeVerifier: "test-verifier",
			}),
		);
		expect(ctx.getJsonResponse()).toEqual({
			oauth_url: "https://api.revenuecat.com/oauth2/authorize?state=state_123",
		});
	});
});
