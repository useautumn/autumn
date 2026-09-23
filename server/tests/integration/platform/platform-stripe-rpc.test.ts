import { expect, test } from "bun:test";
import { AppEnv, Scopes } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { clearRevokedStripeConnection } from "@/external/stripe/webhookHandlers/clearRevokedStripeConnection.js";
import { createKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { bindOAuthAccount } from "../stripe/utils/bindOAuthAccount.js";
import { createOAuthCatalogFixture } from "../stripe/utils/createOAuthCatalogFixture.js";
import { expectRevokedOAuthConfigCorrect } from "../stripe/utils/expectOAuthConnectionCorrect.js";
import { expectStripeRpcCorrect } from "./utils/expectStripeRpcCorrect.js";
import {
	DISCONNECTED,
	type PlatformStripeFixture,
	withPlatformStripeFixtures,
} from "./utils/platformStripeFixture.js";

const bind = ({
	fixture,
	accountId,
}: {
	fixture: PlatformStripeFixture;
	accountId: string;
}) =>
	bindOAuthAccount({
		db: fixture.ctx.db,
		orgId: fixture.ctx.org.id,
		accountId,
	});

const expectAccountStillAuthorized = async ({
	fixture,
	accountId,
}: {
	fixture: PlatformStripeFixture;
	accountId: string;
}) =>
	expect((await fixture.stripe.accounts.retrieve(accountId)).id).toBe(
		accountId,
	);

test("platform Stripe RPC rejects shared and managed accounts without revocation", async () => {
	await withPlatformStripeFixtures({
		names: ["Stripe RPC shared", "Stripe RPC peer"],
		run: async ([target, peer]) => {
			const accountId = await target.createAccount();
			await bind({ fixture: target, accountId });

			// Legacy shared rows predate OAuth uniqueness, so they are seeded directly.
			await peer.update({
				test_stripe_connect: {
					...peer.ctx.org.test_stripe_connect,
					account_id: accountId,
				},
			});
			await expectStripeRpcCorrect({
				operation: "disconnect_stripe",
				slug: target.slug,
				status: 409,
			});
			await expectAccountStillAuthorized({ fixture: target, accountId });

			await target.update({
				test_stripe_connect: {
					...target.ctx.org.test_stripe_connect,
					account_id: accountId,
					master_org_id: defaultCtx.org.id,
				},
			});
			await expectStripeRpcCorrect({
				operation: "get_stripe_connection",
				slug: target.slug,
				body: DISCONNECTED,
			});
			await expectStripeRpcCorrect({
				operation: "disconnect_stripe",
				slug: target.slug,
				status: 400,
			});
			await expectAccountStillAuthorized({ fixture: target, accountId });
		},
	});
}, 120_000);

test("platform Stripe RPC retries locally stale authorization after real Stripe revocation", async () => {
	await withPlatformStripeFixtures({
		names: ["Stripe RPC retry"],
		run: async ([fixture]) => {
			const accountId = await fixture.createAccount();
			await fixture.stripe.oauth.deauthorize({
				client_id: process.env.STRIPE_SANDBOX_CLIENT_ID!,
				stripe_user_id: accountId,
			});
			await fixture.update({
				test_stripe_connect: {
					...fixture.ctx.org.test_stripe_connect,
					account_id: accountId,
				},
			});

			await expectStripeRpcCorrect({
				operation: "disconnect_stripe",
				slug: fixture.slug,
				body: { success: true },
			});
			expect(
				(await fixture.load()).test_stripe_connect?.account_id,
			).toBeUndefined();
		},
	});
}, 120_000);

test("Stripe OAuth cleanup leaves managed replacements and reconnects alone", async () => {
	await withPlatformStripeFixtures({
		names: ["Stripe RPC concurrency"],
		run: async ([fixture]) => {
			const accountId = await fixture.createAccount();
			await bind({ fixture, accountId });
			const staleOrg = await fixture.load();
			const clearStale = () =>
				clearRevokedStripeConnection({
					ctx: { ...fixture.ctx, org: staleOrg },
					accountId,
				});

			// A managed link replaced the OAuth connection after cleanup read the org.
			const managedConnect = {
				...staleOrg.test_stripe_connect,
				master_org_id: defaultCtx.org.id,
			};
			await fixture.update({ test_stripe_connect: managedConnect });
			expect(await clearStale()).toBe(false);
			expect((await fixture.load()).test_stripe_connect).toEqual(
				managedConnect,
			);

			// A reconnect of the same account after cleanup read the org.
			await bind({ fixture, accountId });
			expect(await clearStale()).toBe(false);
			expect((await fixture.load()).test_stripe_connect?.account_id).toBe(
				accountId,
			);
		},
	});
}, 120_000);

test("platform Stripe RPC validates authentication scopes ownership and environment", async () => {
	await withPlatformStripeFixtures({
		names: ["Stripe RPC permissions"],
		run: async ([fixture]) => {
			const { ctx, slug } = fixture;
			const readKey = await createKey({
				db: ctx.db,
				orgId: defaultCtx.org.id,
				env: AppEnv.Sandbox,
				name: "Stripe RPC read",
				prefix: "am_sk_test",
				meta: {},
				scopes: [Scopes.Platform.Read],
			});

			await expectStripeRpcCorrect({
				operation: "get_stripe_connection",
				slug,
				key: readKey,
				body: DISCONNECTED,
			});
			await expectStripeRpcCorrect({
				operation: "disconnect_stripe",
				slug,
				key: readKey,
				status: 403,
			});

			for (const operation of [
				"get_stripe_connection",
				"disconnect_stripe",
			] as const) {
				await expectStripeRpcCorrect({ operation, slug, key: "", status: 401 });
				await expectStripeRpcCorrect({
					operation,
					slug,
					env: "sandbox",
					status: 400,
				});
				await expectStripeRpcCorrect({ operation, slug: "", status: 400 });

				// A tenant's own key cannot address itself through the master's API.
				await expectStripeRpcCorrect({
					operation,
					slug: ctx.org.slug,
					key: ctx.orgSecretKey,
					status: 400,
				});
			}
		},
	});
}, 120_000);

test("platform Stripe RPC reports OAuth only including historical connections", async () => {
	await withPlatformStripeFixtures({
		names: ["Stripe RPC status"],
		run: async ([fixture]) => {
			const { slug } = fixture;
			await expectStripeRpcCorrect({
				operation: "get_stripe_connection",
				slug,
				body: DISCONNECTED,
			});

			await fixture.update({
				stripe_config: { test_api_key: encryptData("sk_test_status_only") },
				test_stripe_connect: {
					...fixture.ctx.org.test_stripe_connect,
					account_id: "acct_historical",
				},
				live_stripe_connect: {
					account_id: "acct_live_status",
					connected_at: 1700000000000,
				},
			});
			await expectStripeRpcCorrect({
				operation: "get_stripe_connection",
				slug,
				body: {
					connected: true,
					account_id: "acct_historical",
					connected_at: null,
				},
			});
			await expectStripeRpcCorrect({
				operation: "get_stripe_connection",
				slug,
				env: "live",
				body: {
					connected: true,
					account_id: "acct_live_status",
					connected_at: 1700000000000,
				},
			});
		},
	});
}, 120_000);

test("platform Stripe RPC really deauthorizes and synchronously preserves unrelated config", async () => {
	for (const secretKey of [false, true]) {
		await withPlatformStripeFixtures({
			names: ["Stripe RPC disconnect"],
			run: async ([fixture]) => {
				const { ctx, slug } = fixture;
				const disconnect = () =>
					expectStripeRpcCorrect({
						operation: "disconnect_stripe",
						slug,
						body: { success: true },
					});

				// Disconnecting with nothing connected is a no-op success.
				await disconnect();

				const accountId = await fixture.createAccount();
				await createOAuthCatalogFixture({ ctx });
				await bind({ fixture, accountId });
				await fixture.update({
					live_stripe_connect: { account_id: "acct_preserved_live" },
					...(secretKey && {
						stripe_config: {
							test_api_key: encryptData("sk_test_preserved"),
							test_webhook_secret: encryptData("whsec_preserved"),
						},
					}),
				});
				const previousOrg = await fixture.load();
				await expectStripeRpcCorrect({
					operation: "get_stripe_connection",
					slug,
					body: {
						connected: true,
						account_id: accountId,
						connected_at: previousOrg.test_stripe_connect?.connected_at,
					},
				});

				await disconnect();
				expect(
					(await fixture.load()).test_stripe_connect?.account_id,
				).toBeUndefined();
				await expect(
					fixture.stripe.accounts.retrieve(accountId),
				).rejects.toMatchObject({ code: "account_invalid" });
				await expectRevokedOAuthConfigCorrect({
					ctx,
					previousOrg,
					ordinary: false,
					keepMappings: secretKey,
					pendingRestoration: false,
				});

				await disconnect();
				await expectStripeRpcCorrect({
					operation: "get_stripe_connection",
					slug,
					body: DISCONNECTED,
				});
			},
		});
	}
}, 120_000);
