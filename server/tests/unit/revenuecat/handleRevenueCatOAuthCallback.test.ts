import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { OAuth2Tokens } from "arctic";

type MockOAuthState = {
	organization_slug: string;
	env: string;
	redirect_uri: string;
	master_org_id: string | null;
	code_verifier?: string;
	provider?: string;
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
		}),
	),
);
const mockOrgGetBySlug = mock(
	(): Promise<Record<string, unknown> | null> => Promise.resolve(null),
);
const mockOrgUpdate = mock((): Promise<null> => Promise.resolve(null));

mock.module("@/db/initDrizzle.js", () => ({
	initDrizzle: () => ({ db: {} }),
}));

mock.module("@/internal/platform/platformBeta/utils/oauthStateUtils.js", () => ({
	consumeOAuthState: mockConsumeOAuthState,
}));

mock.module("@/external/revenueCat/misc/revenuecatOAuth.js", () => ({
	exchangeRcCode: mockExchangeRcCode,
}));

mock.module("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		getBySlug: mockOrgGetBySlug,
		update: mockOrgUpdate,
	},
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

	test("redirects with success and updates org on happy path", async () => {
		mockConsumeOAuthState.mockResolvedValueOnce({
			organization_slug: "test-org",
			env: "test",
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
		expect(ctx.getRedirectUrl()).toContain("success=true");
	});
});
