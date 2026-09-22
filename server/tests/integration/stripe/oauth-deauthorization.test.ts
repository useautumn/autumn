import { test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { WEBHOOK_TEST_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { encryptData } from "@/utils/encryptUtils.js";
import {
	expectOAuthConnectionCorrect,
	expectRevokedOAuthConfigCorrect,
} from "./utils/expectOAuthConnectionCorrect.js";

/** Red: real Stripe revocation leaves the API reporting OAuth connected.
 * Green: the cached API and stored config lose only the revoked OAuth link. */
test.each([false, true])(
	"OAuth deauthorization clears the connection through a real Stripe webhook (secret key: %s)",
	async (hasSecretKey) => {
		const { ctx, autumnV2_3 } = await initScenario({
			setup: [s.platform.create({ name: "OAuth revocation test" })],
			actions: [],
		});
		const stripe = initMasterStripe({ env: AppEnv.Sandbox });
		const clientId = process.env.STRIPE_SANDBOX_CLIENT_ID;
		if (!clientId) throw new Error("STRIPE_SANDBOX_CLIENT_ID is required");
		const account = await stripe.accounts.create({
			type: "standard",
			country: "US",
		});
		let deauthorized = false;

		try {
			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: {
					...(hasSecretKey ? { created_by: null } : {}),
					live_stripe_connect: { account_id: "acct_unrelated_live" },
					...(hasSecretKey
						? {
								stripe_config: {
									test_api_key: encryptData("sk_test_preserve_on_revocation"),
									test_webhook_secret: encryptData(
										"whsec_preserve_on_revocation",
									),
								},
							}
						: {}),
				},
			});
			await OrgService.updateStripeConnect({
				db: ctx.db,
				orgId: ctx.org.id,
				accountId: account.id,
				env: AppEnv.Sandbox,
			});
			await expectOAuthConnectionCorrect({
				autumn: autumnV2_3,
				connected: true,
			});
			const previousOrg = await OrgService.get({
				db: ctx.db,
				orgId: ctx.org.id,
			});

			await stripe.oauth.deauthorize({
				client_id: clientId,
				stripe_user_id: account.id,
			});
			deauthorized = true;

			await expectOAuthConnectionCorrect({
				autumn: autumnV2_3,
				connected: false,
				secretKeyConnected: hasSecretKey,
			});
			await expectRevokedOAuthConfigCorrect({ ctx, previousOrg });
		} finally {
			if (!deauthorized) await stripe.accounts.del(account.id);
			await deletePlatformSubOrg({
				db: ctx.db,
				org: ctx.org,
				logger: ctx.logger,
				skipLiveCustomerCheck: true,
			});
		}
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);
