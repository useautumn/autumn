import { expect } from "bun:test";
import type { FrontendOrg, Organization } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

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
}: {
	ctx: TestContext;
	previousOrg: Organization;
}) => {
	const org = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
	expect(org.test_stripe_connect?.account_id).toBeUndefined();
	expect(org.test_stripe_connect?.default_account_id).toBe(
		previousOrg.test_stripe_connect?.default_account_id,
	);
	expect(org.live_stripe_connect).toEqual(previousOrg.live_stripe_connect);
	expect(org.stripe_config).toEqual(previousOrg.stripe_config);
};
