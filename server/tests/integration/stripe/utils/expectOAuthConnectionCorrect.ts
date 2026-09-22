import { expect } from "bun:test";
import { AppEnv, type FrontendOrg, type Organization } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const expectOAuthConnectionCorrect = async ({
	autumn,
	connected,
	secretKeyConnected,
}: {
	autumn: AutumnInt;
	connected: boolean;
	secretKeyConnected?: boolean;
}) =>
	pollUntilAsserted({
		fetch: async (): Promise<FrontendOrg> => autumn.get("/organization"),
		assert: (org) => {
			expect(org.stripe_oauth_connected).toBe(connected);
			if (secretKeyConnected !== undefined) {
				expect(org.stripe_secret_key_connected).toBe(secretKeyConnected);
			}
		},
		timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
	});

export const expectRevokedOAuthConfigCorrect = async ({
	ctx,
	previousOrg,
	ordinary,
	keepMappings,
	pendingRestoration,
}: {
	ctx: TestContext;
	previousOrg: Organization;
	ordinary: boolean;
	keepMappings: boolean;
	pendingRestoration: boolean;
}) => {
	if (ordinary) expect(previousOrg.created_by).toBeNull();
	else expect(previousOrg.created_by).toBeTruthy();
	const org = await pollUntilAsserted({
		fetch: () => OrgService.get({ db: ctx.db, orgId: ctx.org.id }),
		assert: (current) => {
			expect(current.test_stripe_connect?.account_id).toBeUndefined();
			expect(current.test_stripe_connect?.revoked_account_id).toBe(
				pendingRestoration
					? previousOrg.test_stripe_connect?.account_id
					: undefined,
			);
		},
		timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
	});
	expect(org.test_stripe_connect?.account_id).toBeUndefined();
	expect(org.test_stripe_connect?.default_account_id).toBe(
		previousOrg.test_stripe_connect?.default_account_id,
	);
	expect(org.live_stripe_connect).toEqual(previousOrg.live_stripe_connect);
	expect(org.stripe_config).toEqual(previousOrg.stripe_config);
	if (pendingRestoration) {
		const accountId = previousOrg.test_stripe_connect?.account_id;
		expect(accountId).toBeDefined();
		expect(org.test_stripe_connect?.revoked_account_id).toBe(accountId);
		const retry = await OrgService.getByAccountId({
			db: ctx.db,
			accountId: accountId!,
			deauthorizedEnv: AppEnv.Sandbox,
		});
		expect(retry.org.id).toBe(org.id);
		await expect(
			OrgService.getByAccountId({ db: ctx.db, accountId: accountId! }),
		).rejects.toThrow();
	} else {
		expect(org.test_stripe_connect?.revoked_account_id).toBeUndefined();
	}
	for (const env of [AppEnv.Sandbox, AppEnv.Live]) {
		const plans = await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env,
		});
		expect(plans).toHaveLength(1);
		const preserve = env === AppEnv.Live || keepMappings;
		expect(plans[0].processor?.id ?? null).toBe(
			preserve ? `prod_oauth_${env}` : null,
		);
		expect(plans[0].prices).toHaveLength(1);
		expect(plans[0].prices[0].config.stripe_price_id ?? null).toBe(
			preserve ? `price_oauth_${env}` : null,
		);
	}
};
