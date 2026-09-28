/**
 * RevenueCat rotates both OAuth tokens on every refresh, so concurrent refreshes and stale saves lock an org out.
 *
 * Red (before): two expired-token readers both refresh and the loser gets invalid_grant; the save spreads a
 *               stale org over processor_configs, and a rotated refresh token is overwritten regardless.
 * Green (after): one refresh under a per-org+env lock, a DB re-read inside it, and a jsonb write of the one
 *                oauth key that compare-and-swaps on the refresh token it used.
 */

import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import {
	AppEnv,
	type Organization,
	organizations,
	type RevenueCatOAuthConfig,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { OAuth2Tokens } from "arctic";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import { acquireLock } from "@/external/redis/utils/lockUtils/acquireLock";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock";
import { OrgService } from "@/internal/orgs/OrgService";
import { decryptData, encryptData } from "@/utils/encryptUtils";

/** Fake RC token endpoint: each refresh token works once and is revoked on use. */
const rcTokenEndpoint = {
	validRefreshTokens: new Set<string>(),
	issued: 0,
	calls: 0,
	onRefresh: null as null | (() => Promise<void>),
};

mock.module("@/external/revenueCat/misc/revenuecatOAuth.js", () => ({
	refreshRcTokens: async ({ refreshToken }: { refreshToken: string }) => {
		rcTokenEndpoint.calls++;
		await new Promise((resolve) => setTimeout(resolve, 150));
		if (!rcTokenEndpoint.validRefreshTokens.delete(refreshToken)) {
			throw new Error("invalid_grant: refresh token revoked");
		}
		await rcTokenEndpoint.onRefresh?.();
		const n = ++rcTokenEndpoint.issued;
		rcTokenEndpoint.validRefreshTokens.add(`rtk_${n}`);
		return new OAuth2Tokens({
			access_token: `atk_${n}`,
			token_type: "Bearer",
			expires_in: 3600,
			refresh_token: `rtk_${n}`,
		});
	},
}));

const { getRevenuecatAccessToken } = await import(
	"@/external/revenueCat/misc/getRevenuecatAccessToken.js"
);

const HOUR_MS = 60 * 60 * 1000;
const createdOrgIds: string[] = [];

const oauthPair = ({
	accessToken,
	refreshToken,
	expiresAt,
}: {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
}): RevenueCatOAuthConfig => ({
	access_token: encryptData(accessToken),
	refresh_token: encryptData(refreshToken),
	expires_at: expiresAt,
	project_id: "proj_rc_oauth_test",
});

const insertOAuthOrg = async ({
	orgId,
	processorConfigs,
}: {
	orgId: string;
	processorConfigs: Organization["processor_configs"];
}): Promise<Organization> => {
	await ctx.db.delete(organizations).where(eq(organizations.id, orgId));
	await ctx.db.insert(organizations).values({
		id: orgId,
		slug: orgId,
		name: orgId,
		createdAt: new Date(),
		processor_configs: processorConfigs,
	});
	createdOrgIds.push(orgId);
	return OrgService.get({ db: ctx.db, orgId });
};

const readRevenueCatConfig = async ({ orgId }: { orgId: string }) =>
	(await OrgService.get({ db: ctx.db, orgId })).processor_configs?.revenuecat;

beforeEach(() => {
	rcTokenEndpoint.validRefreshTokens.clear();
	rcTokenEndpoint.issued = 0;
	rcTokenEndpoint.calls = 0;
	rcTokenEndpoint.onRefresh = null;
});

afterAll(async () => {
	if (createdOrgIds.length === 0) return;
	await ctx.db
		.delete(organizations)
		.where(inArray(organizations.id, createdOrgIds));
});

test(`${chalk.yellowBright("rc oauth refresh: concurrent expired readers make one refresh and share its token")}`, async () => {
	rcTokenEndpoint.validRefreshTokens.add("rtk_0");
	const staleOrg = await insertOAuthOrg({
		orgId: "org_rc_oauth_concurrent",
		processorConfigs: {
			revenuecat: {
				sandbox_oauth: oauthPair({
					accessToken: "atk_0",
					refreshToken: "rtk_0",
					expiresAt: Date.now() - 1000,
				}),
			},
		},
	});

	const results = await Promise.allSettled([
		getRevenuecatAccessToken({
			db: ctx.db,
			org: staleOrg,
			env: AppEnv.Sandbox,
		}),
		getRevenuecatAccessToken({
			db: ctx.db,
			org: staleOrg,
			env: AppEnv.Sandbox,
		}),
	]);

	expect(rcTokenEndpoint.calls).toBe(1);
	expect(results).toEqual([
		{ status: "fulfilled", value: "atk_1" },
		{ status: "fulfilled", value: "atk_1" },
	]);

	const stored = await readRevenueCatConfig({ orgId: staleOrg.id });
	expect(decryptData(stored?.sandbox_oauth?.refresh_token ?? "")).toBe("rtk_1");
});

test(`${chalk.yellowBright("rc oauth refresh: a stale org snapshot does not clobber newer processor_configs")}`, async () => {
	rcTokenEndpoint.validRefreshTokens.add("rtk_live_0");
	const staleOrg = await insertOAuthOrg({
		orgId: "org_rc_oauth_stale_snapshot",
		processorConfigs: {
			revenuecat: {
				oauth: oauthPair({
					accessToken: "atk_live_0",
					refreshToken: "rtk_live_0",
					expiresAt: Date.now() - 1000,
				}),
				sandbox_oauth: oauthPair({
					accessToken: "atk_sandbox_0",
					refreshToken: "rtk_sandbox_0",
					expiresAt: Date.now() + HOUR_MS,
				}),
			},
		},
	});

	// Another process rotates sandbox and adds a webhook secret after our snapshot was taken.
	const newerSandboxOAuth = oauthPair({
		accessToken: "atk_sandbox_1",
		refreshToken: "rtk_sandbox_1",
		expiresAt: Date.now() + HOUR_MS,
	});
	await OrgService.update({
		db: ctx.db,
		orgId: staleOrg.id,
		updates: {
			processor_configs: {
				revenuecat: {
					...staleOrg.processor_configs?.revenuecat,
					sandbox_oauth: newerSandboxOAuth,
					webhook_secret: "whsec_newer",
				},
			},
		},
	});

	const token = await getRevenuecatAccessToken({
		db: ctx.db,
		org: staleOrg,
		env: AppEnv.Live,
	});
	expect(token).toBe("atk_1");

	const stored = await readRevenueCatConfig({ orgId: staleOrg.id });
	expect(decryptData(stored?.oauth?.refresh_token ?? "")).toBe("rtk_1");
	expect(stored?.sandbox_oauth).toEqual(newerSandboxOAuth);
	expect(stored?.webhook_secret).toBe("whsec_newer");
});

test(`${chalk.yellowBright("rc oauth refresh: a compare-and-swap miss returns the stored token and writes nothing")}`, async () => {
	rcTokenEndpoint.validRefreshTokens.add("rtk_0");
	const staleOrg = await insertOAuthOrg({
		orgId: "org_rc_oauth_cas_miss",
		processorConfigs: {
			revenuecat: {
				sandbox_oauth: oauthPair({
					accessToken: "atk_0",
					refreshToken: "rtk_0",
					expiresAt: Date.now() - 1000,
				}),
			},
		},
	});

	// An unlocked writer (e.g. an OAuth reconnect) stores a new pair while our refresh is in flight.
	const reconnectedOAuth = oauthPair({
		accessToken: "atk_reconnect",
		refreshToken: "rtk_reconnect",
		expiresAt: Date.now() + HOUR_MS,
	});
	rcTokenEndpoint.onRefresh = async () => {
		await OrgService.update({
			db: ctx.db,
			orgId: staleOrg.id,
			updates: {
				processor_configs: { revenuecat: { sandbox_oauth: reconnectedOAuth } },
			},
		});
	};

	const token = await getRevenuecatAccessToken({
		db: ctx.db,
		org: staleOrg,
		env: AppEnv.Sandbox,
	});

	expect(rcTokenEndpoint.calls).toBe(1);
	expect(token).toBe("atk_reconnect");
	const stored = await readRevenueCatConfig({ orgId: staleOrg.id });
	expect(stored?.sandbox_oauth).toEqual(reconnectedOAuth);
});

test(`${chalk.yellowBright("rc oauth refresh: a lock wait timeout re-reads the stored token instead of refreshing unlocked")}`, async () => {
	rcTokenEndpoint.validRefreshTokens.add("rtk_0");
	const staleOrg = await insertOAuthOrg({
		orgId: "org_rc_oauth_lock_timeout",
		processorConfigs: {
			revenuecat: {
				sandbox_oauth: oauthPair({
					accessToken: "atk_0",
					refreshToken: "rtk_0",
					expiresAt: Date.now() - 1000,
				}),
			},
		},
	});

	// A stuck holder refreshed and saved, but never released the lock.
	const lockKey = `revenuecat:oauth-refresh:${staleOrg.id}:${AppEnv.Sandbox}`;
	await acquireLock({ lockKey, ttlMs: 60_000, token: "stuck_holder" });
	await OrgService.update({
		db: ctx.db,
		orgId: staleOrg.id,
		updates: {
			processor_configs: {
				revenuecat: {
					sandbox_oauth: oauthPair({
						accessToken: "atk_holder",
						refreshToken: "rtk_holder",
						expiresAt: Date.now() + HOUR_MS,
					}),
				},
			},
		},
	});

	try {
		const token = await getRevenuecatAccessToken({
			db: ctx.db,
			org: staleOrg,
			env: AppEnv.Sandbox,
		});
		expect(rcTokenEndpoint.calls).toBe(0);
		expect(token).toBe("atk_holder");
	} finally {
		await clearLock({ lockKey, token: "stuck_holder" });
	}
});
