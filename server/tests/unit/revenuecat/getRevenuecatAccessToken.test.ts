import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	AppEnv,
	type Organization,
	type RevenueCatOAuthConfig,
} from "@autumn/shared";
import { OAuth2Tokens } from "arctic";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

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

let storedOrg: Organization | null = null;
const mockOrgGet = mock(() => Promise.resolve(storedOrg as Organization));
const mockSwapRevenueCatOAuth = mock(
	(_args: {
		env: AppEnv;
		oauthConfig: RevenueCatOAuthConfig;
		expectedRefreshToken: string;
	}): Promise<boolean> => Promise.resolve(true),
);

await mockModuleWithRestore(
	"@/external/revenueCat/misc/revenuecatOAuth.js",
	() => ({
		refreshRcTokens: mockRefreshRcTokens,
	}),
);

await mockModuleWithRestore("@/internal/orgs/OrgService.js", () => ({
	OrgService: { get: mockOrgGet },
}));

await mockModuleWithRestore("@/internal/orgs/repos/index.js", () => ({
	orgRepo: { swapRevenueCatOAuth: mockSwapRevenueCatOAuth },
}));

await mockModuleWithRestore(
	"@/internal/orgs/orgUtils/clearOrgCache.js",
	() => ({
		clearOrgCache: () => Promise.resolve(),
	}),
);

await mockModuleWithRestore(
	"@/external/redis/utils/lockUtils/acquireLockWithWait.js",
	() => ({ acquireLockWithWait: () => Promise.resolve() }),
);

await mockModuleWithRestore(
	"@/external/redis/utils/lockUtils/clearLock.js",
	() => ({ clearLock: () => Promise.resolve() }),
);

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
		mockOrgGet.mockClear();
		mockSwapRevenueCatOAuth.mockClear();
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
		expect(mockSwapRevenueCatOAuth).not.toHaveBeenCalled();
	});

	test("refreshes and persists rotated tokens when expired", async () => {
		const org = buildOrg({ expiresAt: Date.now() - 1000 });
		storedOrg = org;

		const token = await getRevenuecatAccessToken({
			db: {} as never,
			org,
			env: AppEnv.Sandbox,
		});

		expect(token).toBe("atk_refreshed");
		expect(mockRefreshRcTokens).toHaveBeenCalledTimes(1);
		expect(mockSwapRevenueCatOAuth).toHaveBeenCalledTimes(1);

		const swapCall = mockSwapRevenueCatOAuth.mock.calls[0]?.[0];
		expect(swapCall?.env).toBe(AppEnv.Sandbox);
		expect(swapCall?.expectedRefreshToken).toBe(
			org.processor_configs?.revenuecat?.sandbox_oauth?.refresh_token ?? "",
		);
		expect(decryptData(swapCall?.oauthConfig.refresh_token ?? "")).toBe(
			"rtk_rotated",
		);
		expect(swapCall?.oauthConfig.expires_at).toBeGreaterThan(Date.now());
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
