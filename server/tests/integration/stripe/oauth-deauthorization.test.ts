import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import {
	WEBHOOK_SETTLE_TIMEOUT_MS,
	WEBHOOK_TEST_TIMEOUT_MS,
} from "@tests/utils/pollableCustomerExpect.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { bindOAuthAccount } from "./utils/bindOAuthAccount.js";
import { createOAuthCatalogFixture } from "./utils/createOAuthCatalogFixture.js";
import {
	expectOAuthConnectionCorrect,
	expectRevokedOAuthConfigCorrect,
} from "./utils/expectOAuthConnectionCorrect.js";

/** Red: real Stripe revocation leaves the API reporting OAuth connected.
 * Green: the cached API and stored config lose only the revoked OAuth link. */
for (const scenario of [
	{
		name: "Platform OAuth-only",
		ordinary: false,
		secretKey: false,
		webhook: false,
	},
	{
		name: "ordinary dual-auth",
		ordinary: true,
		secretKey: true,
		webhook: true,
	},
	{
		name: "failed webhook restoration",
		ordinary: true,
		secretKey: true,
		webhook: false,
	},
])
	test(
		`OAuth deauthorization clears the connection: ${scenario.name}`,
		async () => {
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
				await createOAuthCatalogFixture({ ctx });
				await bindOAuthAccount({
					db: ctx.db,
					orgId: ctx.org.id,
					accountId: account.id,
				});
				await OrgService.update({
					db: ctx.db,
					orgId: ctx.org.id,
					updates: {
						...(scenario.ordinary ? { created_by: null } : {}),
						live_stripe_connect: { account_id: "acct_unrelated_live" },
						...(scenario.secretKey
							? {
									stripe_config: {
										test_api_key: encryptData("sk_test_preserve_on_revocation"),
										...(scenario.webhook
											? {
													test_webhook_secret: encryptData(
														"whsec_preserve_on_revocation",
													),
												}
											: {}),
									},
								}
							: {}),
					},
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
					secretKeyConnected: scenario.secretKey,
				});
				await expectRevokedOAuthConfigCorrect({
					ctx,
					previousOrg,
					ordinary: scenario.ordinary,
					keepMappings: scenario.secretKey,
					pendingRestoration: scenario.secretKey && !scenario.webhook,
				});
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

/** Red: legacy rows sharing one revoked OAuth account are only partly cleared.
 * Green: every unmanaged row in the environment is cleared; managed rows are untouched. */
test(
	"OAuth deauthorization clears every legacy row sharing the account and skips managed rows",
	async () => {
		const { db } = initDrizzle();
		const stripe = initMasterStripe({ env: AppEnv.Sandbox });
		const clientId = process.env.STRIPE_SANDBOX_CLIENT_ID;
		if (!clientId) throw new Error("STRIPE_SANDBOX_CLIENT_ID is required");
		const account = await stripe.accounts.create({
			type: "standard",
			country: "US",
		});
		const createOrg = async () => {
			const id = generateId("org");
			return OrgService.create({
				db,
				id,
				slug: id,
				name: "Shared OAuth fixture",
			});
		};
		const managed = await createOrg();
		const first = await createOrg();
		const second = await createOrg();
		let deauthorized = false;
		try {
			const managedConnect = {
				account_id: account.id,
				master_org_id: "org_unrelated_master",
			};
			await OrgService.update({
				db,
				orgId: managed.id,
				updates: { test_stripe_connect: managedConnect },
			});
			for (const org of [first, second])
				await OrgService.update({
					db,
					orgId: org.id,
					updates: {
						test_stripe_connect: {
							account_id: account.id,
							connected_at: Date.now(),
						},
					},
				});

			await stripe.oauth.deauthorize({
				client_id: clientId,
				stripe_user_id: account.id,
			});
			deauthorized = true;

			await pollUntilAsserted({
				fetch: () =>
					Promise.all(
						[first, second].map((org) => OrgService.get({ db, orgId: org.id })),
					),
				assert: (orgs) => {
					for (const org of orgs) expect(org.test_stripe_connect).toEqual({});
				},
				timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			});
			expect(
				(await OrgService.get({ db, orgId: managed.id })).test_stripe_connect,
			).toEqual(managedConnect);
		} finally {
			if (!deauthorized) await stripe.accounts.del(account.id);
			for (const org of [managed, first, second])
				await OrgService.delete({ db, orgId: org.id });
		}
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);

/** Dashboard OAuth disconnect deauthorizes under the account lock, so the real
 * deauthorization webhook finds nothing left to rewrite. */
test(
	"dashboard OAuth disconnect revokes Stripe access and settles with its webhook",
	async () => {
		const { ctx, autumnV2_3 } = await initScenario({
			setup: [s.platform.create({ name: "Dashboard OAuth disconnect" })],
			actions: [],
		});
		const stripe = initMasterStripe({ env: AppEnv.Sandbox });
		const account = await stripe.accounts.create({
			type: "standard",
			country: "US",
		});
		let deauthorized = false;
		try {
			await createOAuthCatalogFixture({ ctx });
			await bindOAuthAccount({
				db: ctx.db,
				orgId: ctx.org.id,
				accountId: account.id,
			});
			const previousOrg = await OrgService.get({
				db: ctx.db,
				orgId: ctx.org.id,
			});

			await autumnV2_3.delete("/organization/stripe");
			deauthorized = true;

			await expect(stripe.accounts.retrieve(account.id)).rejects.toMatchObject({
				code: "account_invalid",
			});
			await expectOAuthConnectionCorrect({
				autumn: autumnV2_3,
				connected: false,
			});
			await expectRevokedOAuthConfigCorrect({
				ctx,
				previousOrg,
				ordinary: false,
				keepMappings: false,
				pendingRestoration: false,
			});
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
