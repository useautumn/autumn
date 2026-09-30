import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import { OAuth2RequestError, OAuth2Tokens } from "arctic";
import { encryptData } from "@/utils/encryptUtils.js";

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

const mockOrgUpdate = mock(
	async ({ updates }: { updates: Partial<Organization> }): Promise<null> => {
		storedOrg = { ...(storedOrg as Organization), ...updates };
		return null;
	},
);

const mockOrgGet = mock(async () => storedOrg as Organization);

// In-memory stand-in for the Redis lock so waiters really queue behind the holder.
const heldLocks = new Set<string>();

const mockAcquireLockWithWait = mock(
	async ({ lockKey }: { lockKey: string }) => {
		while (heldLocks.has(lockKey)) {
			await new Promise((resolve) => setTimeout(resolve, 1));
		}
		heldLocks.add(lockKey);
	},
);

const mockClearLock = mock(async ({ lockKey }: { lockKey: string }) => {
	heldLocks.delete(lockKey);
});

await mockModuleWithRestore(
	"@/external/redis/utils/lockUtils/acquireLockWithWait.js",
	() => ({ acquireLockWithWait: mockAcquireLockWithWait }),
);

await mockModuleWithRestore(
	"@/external/redis/utils/lockUtils/clearLock.js",
	() => ({ clearLock: mockClearLock }),
);

await mockModuleWithRestore(
	"@/external/revenueCat/misc/revenuecatOAuth.js",
	() => ({
		refreshRcTokens: mockRefreshRcTokens,
	}),
);

await mockModuleWithRestore("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		update: mockOrgUpdate,
		get: mockOrgGet,
	},
}));

const { getRevenuecatAccessToken, refreshRevenuecatOAuthAccessToken } =
	await import("@/external/revenueCat/misc/getRevenuecatAccessToken.js");

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
		mockOrgGet.mockClear();
		heldLocks.clear();
		storedOrg = null;
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
		storedOrg = org;

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

	test("concurrent callers with an expired token share a single refresh", async () => {
		const org = buildOrg({ expiresAt: Date.now() - 1000 });
		storedOrg = org;

		const tokens = await Promise.all(
			[1, 2, 3].map(() =>
				getRevenuecatAccessToken({
					db: {} as never,
					org,
					env: AppEnv.Sandbox,
				}),
			),
		);

		expect(tokens).toEqual(["atk_refreshed", "atk_refreshed", "atk_refreshed"]);
		expect(mockRefreshRcTokens).toHaveBeenCalledTimes(1);
		expect(mockOrgUpdate).toHaveBeenCalledTimes(1);
	});

	test("force refresh always rotates, even when the stored token is fresh", async () => {
		const org = buildOrg({ expiresAt: Date.now() + 60 * 60 * 1000 });
		storedOrg = org;

		const token = await refreshRevenuecatOAuthAccessToken({
			db: {} as never,
			org,
			env: AppEnv.Sandbox,
		});

		expect(token).toBe("atk_refreshed");
		expect(mockRefreshRcTokens).toHaveBeenCalledTimes(1);
	});

	test("concurrent force refreshes coalesce into a single rotation", async () => {
		const org = buildOrg({ expiresAt: Date.now() + 60 * 60 * 1000 });
		storedOrg = org;

		const tokens = await Promise.all(
			[1, 2].map(() =>
				refreshRevenuecatOAuthAccessToken({
					db: {} as never,
					org,
					env: AppEnv.Sandbox,
				}),
			),
		);

		expect(tokens).toEqual(["atk_refreshed", "atk_refreshed"]);
		expect(mockRefreshRcTokens).toHaveBeenCalledTimes(1);
		expect(mockOrgUpdate).toHaveBeenCalledTimes(1);
	});

	test("revoked refresh token surfaces a reconnect error and releases the lock", async () => {
		const org = buildOrg({ expiresAt: Date.now() - 1000 });
		storedOrg = org;
		mockRefreshRcTokens.mockImplementationOnce(() =>
			Promise.reject(new OAuth2RequestError("invalid_grant", null, null, null)),
		);

		await expect(
			getRevenuecatAccessToken({ db: {} as never, org, env: AppEnv.Sandbox }),
		).rejects.toMatchObject({ statusCode: 400 });
		expect(mockOrgUpdate).not.toHaveBeenCalled();
		expect(heldLocks.size).toBe(0);
	});
});
