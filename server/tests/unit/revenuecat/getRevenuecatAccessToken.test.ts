import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import { OAuth2Tokens } from "arctic";
import { encryptData } from "@/utils/encryptUtils.js";

const mockRefreshRcTokens = mock(() =>
	Promise.resolve(
		new OAuth2Tokens({
			access_token: "atk_refreshed",
			token_type: "Bearer",
			expires_in: 3600,
			refresh_token: "rtk_rotated",
		}),
	),
);

const mockOrgUpdate = mock(
	(_args: { updates: Organization }): Promise<null> => Promise.resolve(null),
);

mock.module("@/external/revenueCat/misc/revenuecatOAuth.js", () => ({
	refreshRcTokens: mockRefreshRcTokens,
}));

mock.module("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		update: mockOrgUpdate,
	},
}));

const { getRevenuecatAccessToken } = await import(
	"@/external/revenueCat/misc/getRevenuecatAccessToken.js"
);

const buildOrg = ({
	expiresAt,
	withApiKey = false,
}: {
	expiresAt: number;
	withApiKey?: boolean;
}): Organization =>
	({
		id: "org_123",
		processor_configs: {
			revenuecat: {
				...(withApiKey
					? { sandbox_api_key: encryptData("legacy_api_key") }
					: {}),
				sandbox_oauth: {
					access_token: encryptData("cached_access_token"),
					refresh_token: encryptData("cached_refresh_token"),
					expires_at: expiresAt,
				},
				webhook_secret: "whsec",
				sandbox_webhook_secret: "whsec_sandbox",
			},
		},
	}) as Organization;

describe("getRevenuecatAccessToken", () => {
	beforeEach(() => {
		process.env.ENCRYPTION_PASSWORD = "test-encryption-password";
		mockRefreshRcTokens.mockClear();
		mockOrgUpdate.mockClear();
	});

	afterEach(() => {
		delete process.env.ENCRYPTION_PASSWORD;
	});

	test("returns cached access token when not expired", async () => {
		const org = buildOrg({ expiresAt: Date.now() + 60 * 60 * 1000 });

		const token = await getRevenuecatAccessToken({
			db: {} as never,
			org,
			env: AppEnv.Sandbox,
		});

		expect(token).toBe("cached_access_token");
		expect(mockRefreshRcTokens).not.toHaveBeenCalled();
		expect(mockOrgUpdate).not.toHaveBeenCalled();
	});

	test("refreshes and persists rotated tokens when expired", async () => {
		const org = buildOrg({ expiresAt: Date.now() - 1000 });

		const token = await getRevenuecatAccessToken({
			db: {} as never,
			org,
			env: AppEnv.Sandbox,
		});

		expect(token).toBe("atk_refreshed");
		expect(mockRefreshRcTokens).toHaveBeenCalledTimes(1);
		expect(mockOrgUpdate).toHaveBeenCalledTimes(1);

		const updateCall = mockOrgUpdate.mock.calls[0]?.[0];
		const sandboxOauth =
			updateCall?.updates.processor_configs?.revenuecat?.sandbox_oauth;

		expect(sandboxOauth?.access_token).toBeDefined();
		expect(sandboxOauth?.refresh_token).toBeDefined();
		expect(sandboxOauth?.expires_at).toBeGreaterThan(Date.now());
	});

	test("falls back to legacy api_key when oauth is absent", async () => {
		const org = {
			id: "org_123",
			processor_configs: {
				revenuecat: {
					sandbox_api_key: encryptData("legacy_api_key"),
				},
			},
		} as Organization;

		const token = await getRevenuecatAccessToken({
			db: {} as never,
			org,
			env: AppEnv.Sandbox,
		});

		expect(token).toBe("legacy_api_key");
		expect(mockRefreshRcTokens).not.toHaveBeenCalled();
	});
});
