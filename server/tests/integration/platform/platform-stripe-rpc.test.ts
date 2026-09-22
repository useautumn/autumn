import { expect, test } from "bun:test";
import { AppEnv, Scopes } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import { clearRevokedStripeConnection } from "@/external/stripe/webhookHandlers/clearRevokedStripeConnection.js";
import { createKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { createOAuthCatalogFixture } from "../stripe/utils/createOAuthCatalogFixture.js";
import { expectRevokedOAuthConfigCorrect } from "../stripe/utils/expectOAuthConnectionCorrect.js";
import { expectStripeRpcCorrect } from "./utils/expectStripeRpcCorrect.js";

const rpc = ({
	operation,
	body,
	key = defaultCtx.orgSecretKey,
}: {
	operation: "get_stripe_connection" | "disconnect_stripe";
	body: Record<string, unknown>;
	key?: string;
}) =>
	fetch(
		`${process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080"}/v1/platform.${operation}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(key ? { Authorization: `Bearer ${key}` } : {}),
			},
			body: JSON.stringify(body),
		},
	);

test("platform Stripe RPC rejects shared and managed accounts without revocation", async () => {
	const first = await initScenario({
		setup: [s.platform.create({ name: "Stripe RPC shared" })],
		actions: [],
	});
	const second = await initScenario({
		setup: [s.platform.create({ name: "Stripe RPC peer" })],
		actions: [],
	});
	const stripe = initMasterStripe({ env: AppEnv.Sandbox });
	const account = await stripe.accounts.create({
		type: "standard",
		country: "US",
	});
	const body = {
		organization_slug: first.ctx.org.slug.split("|")[0],
		env: "test",
	};
	try {
		for (const { ctx } of [first, second])
			await OrgService.updateStripeConnect({
				db: ctx.db,
				orgId: ctx.org.id,
				accountId: account.id,
				env: AppEnv.Sandbox,
			});
		await expectStripeRpcCorrect({
			response: await rpc({ operation: "disconnect_stripe", body }),
			status: 409,
		});
		expect((await stripe.accounts.retrieve(account.id)).id).toBe(account.id);
		await OrgService.update({
			db: first.ctx.db,
			orgId: first.ctx.org.id,
			updates: {
				test_stripe_connect: {
					...first.ctx.org.test_stripe_connect,
					account_id: account.id,
					master_org_id: defaultCtx.org.id,
				},
			},
		});
		await expectStripeRpcCorrect({
			response: await rpc({ operation: "get_stripe_connection", body }),
			body: { connected: false, account_id: null, connected_at: null },
		});
		await expectStripeRpcCorrect({
			response: await rpc({ operation: "disconnect_stripe", body }),
			status: 400,
		});
		expect((await stripe.accounts.retrieve(account.id)).id).toBe(account.id);
	} finally {
		await stripe.accounts.del(account.id).catch(() => {});
		for (const { ctx } of [first, second]) {
			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: { test_stripe_connect: ctx.org.test_stripe_connect },
			});
			await deletePlatformSubOrg({
				db: ctx.db,
				org: ctx.org,
				logger: ctx.logger,
				skipLiveCustomerCheck: true,
			});
		}
	}
}, 120_000);

test("platform Stripe RPC retries locally stale authorization after real Stripe revocation", async () => {
	const { ctx } = await initScenario({
		setup: [s.platform.create({ name: "Stripe RPC retry" })],
		actions: [],
	});
	const stripe = initMasterStripe({ env: AppEnv.Sandbox });
	const account = await stripe.accounts.create({
		type: "standard",
		country: "US",
	});
	try {
		await stripe.oauth.deauthorize({
			client_id: process.env.STRIPE_SANDBOX_CLIENT_ID!,
			stripe_user_id: account.id,
		});
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				test_stripe_connect: {
					...ctx.org.test_stripe_connect,
					account_id: account.id,
				},
			},
		});
		await expectStripeRpcCorrect({
			response: await rpc({
				operation: "disconnect_stripe",
				body: { organization_slug: ctx.org.slug.split("|")[0], env: "test" },
			}),
			body: { success: true },
		});
		expect(
			(await OrgService.get({ db: ctx.db, orgId: ctx.org.id }))
				.test_stripe_connect?.account_id,
		).toBeUndefined();
	} finally {
		await stripe.accounts.del(account.id).catch(() => {});
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { test_stripe_connect: ctx.org.test_stripe_connect },
		});
		await deletePlatformSubOrg({
			db: ctx.db,
			org: ctx.org,
			logger: ctx.logger,
			skipLiveCustomerCheck: true,
		});
	}
}, 120_000);

test("Stripe OAuth cleanup preserves reconnects and rejects delayed revoked account binding", async () => {
	const { ctx } = await initScenario({
		setup: [s.platform.create({ name: "Stripe RPC concurrency" })],
		actions: [],
	});
	const stripe = initMasterStripe({ env: AppEnv.Sandbox });
	const account = await stripe.accounts.create({
		type: "standard",
		country: "US",
	});
	try {
		await OrgService.updateStripeConnect({
			db: ctx.db,
			orgId: ctx.org.id,
			accountId: account.id,
			env: AppEnv.Sandbox,
		});
		const oldOrg = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				test_stripe_connect: {
					...oldOrg.test_stripe_connect,
					master_org_id: defaultCtx.org.id,
				},
			},
		});
		expect(
			await clearRevokedStripeConnection({
				ctx: { ...ctx, org: oldOrg },
				accountId: account.id,
			}),
		).toBe(false);
		expect(
			(await OrgService.get({ db: ctx.db, orgId: ctx.org.id }))
				.test_stripe_connect,
		).toEqual({
			...oldOrg.test_stripe_connect,
			master_org_id: defaultCtx.org.id,
		});
		await OrgService.updateStripeConnect({
			db: ctx.db,
			orgId: ctx.org.id,
			accountId: account.id,
			env: AppEnv.Sandbox,
		});
		expect(
			await clearRevokedStripeConnection({
				ctx: { ...ctx, org: oldOrg },
				accountId: account.id,
			}),
		).toBe(false);
		expect(
			(await OrgService.get({ db: ctx.db, orgId: ctx.org.id }))
				.test_stripe_connect?.account_id,
		).toBe(account.id);
		await stripe.oauth.deauthorize({
			client_id: process.env.STRIPE_SANDBOX_CLIENT_ID!,
			stripe_user_id: account.id,
		});
		await expect(
			OrgService.updateStripeConnect({
				db: ctx.db,
				orgId: ctx.org.id,
				accountId: account.id,
				env: AppEnv.Sandbox,
			}),
		).rejects.toMatchObject({ code: "account_invalid" });
	} finally {
		await stripe.accounts.del(account.id).catch(() => {});
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { test_stripe_connect: ctx.org.test_stripe_connect },
		});
		await deletePlatformSubOrg({
			db: ctx.db,
			org: ctx.org,
			logger: ctx.logger,
			skipLiveCustomerCheck: true,
		});
	}
}, 120_000);

test("platform Stripe RPC validates authentication scopes ownership and environment", async () => {
	const { ctx } = await initScenario({
		setup: [s.platform.create({ name: "Stripe RPC permissions" })],
		actions: [],
	});
	const organization_slug = ctx.org.slug.split("|")[0];
	const readKey = await createKey({
		db: ctx.db,
		orgId: defaultCtx.org.id,
		env: AppEnv.Sandbox,
		name: "Stripe RPC read",
		prefix: "am_sk_test",
		meta: {},
		scopes: [Scopes.Platform.Read],
	});
	try {
		await expectStripeRpcCorrect({
			response: await rpc({
				operation: "get_stripe_connection",
				body: { organization_slug, env: "test" },
				key: readKey,
			}),
			body: { connected: false, account_id: null, connected_at: null },
		});
		for (const operation of [
			"get_stripe_connection",
			"disconnect_stripe",
		] as const) {
			await expectStripeRpcCorrect({
				response: await rpc({
					operation,
					body: { organization_slug, env: "test" },
					key: "",
				}),
				status: 401,
			});
			await expectStripeRpcCorrect({
				response: await rpc({
					operation,
					body: { organization_slug, env: "sandbox" },
				}),
				status: 400,
			});
			await expectStripeRpcCorrect({
				response: await rpc({
					operation,
					body: { organization_slug: "", env: "test" },
				}),
				status: 400,
			});
			await expectStripeRpcCorrect({
				response: await rpc({
					operation,
					body: { organization_slug: ctx.org.slug, env: "test" },
					key: ctx.orgSecretKey,
				}),
				status: 400,
			});
		}
		await expectStripeRpcCorrect({
			response: await rpc({
				operation: "disconnect_stripe",
				body: { organization_slug, env: "test" },
				key: readKey,
			}),
			status: 403,
		});
	} finally {
		await deletePlatformSubOrg({
			db: ctx.db,
			org: ctx.org,
			logger: ctx.logger,
			skipLiveCustomerCheck: true,
		});
	}
}, 120_000);

test("platform Stripe RPC reports OAuth only including historical connections", async () => {
	const { ctx } = await initScenario({
		setup: [s.platform.create({ name: "Stripe RPC status" })],
		actions: [],
	});
	const organization_slug = ctx.org.slug.split("|")[0];
	try {
		await expectStripeRpcCorrect({
			response: await rpc({
				operation: "get_stripe_connection",
				body: { organization_slug, env: "test" },
			}),
			body: { connected: false, account_id: null, connected_at: null },
		});
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				stripe_config: { test_api_key: encryptData("sk_test_status_only") },
				test_stripe_connect: {
					...ctx.org.test_stripe_connect,
					account_id: "acct_historical",
				},
				live_stripe_connect: {
					account_id: "acct_live_status",
					connected_at: 1700000000000,
				},
			},
		});
		await expectStripeRpcCorrect({
			response: await rpc({
				operation: "get_stripe_connection",
				body: { organization_slug, env: "test" },
			}),
			body: {
				connected: true,
				account_id: "acct_historical",
				connected_at: null,
			},
		});
		await expectStripeRpcCorrect({
			response: await rpc({
				operation: "get_stripe_connection",
				body: { organization_slug, env: "live" },
			}),
			body: {
				connected: true,
				account_id: "acct_live_status",
				connected_at: 1700000000000,
			},
		});
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				test_stripe_connect: ctx.org.test_stripe_connect,
				live_stripe_connect: {},
				stripe_config: null,
			},
		});
		await deletePlatformSubOrg({
			db: ctx.db,
			org: ctx.org,
			logger: ctx.logger,
			skipLiveCustomerCheck: true,
		});
	}
}, 120_000);

test("platform Stripe RPC really deauthorizes and synchronously preserves unrelated config", async () => {
	for (const secretKey of [false, true]) {
		const { ctx } = await initScenario({
			setup: [s.platform.create({ name: "Stripe RPC disconnect" })],
			actions: [],
		});
		const organization_slug = ctx.org.slug.split("|")[0];
		const stripe = initMasterStripe({ env: AppEnv.Sandbox });
		const account = await stripe.accounts.create({
			type: "standard",
			country: "US",
		});
		try {
			await expectStripeRpcCorrect({
				response: await rpc({
					operation: "disconnect_stripe",
					body: { organization_slug, env: "test" },
				}),
				body: { success: true },
			});
			await createOAuthCatalogFixture({ ctx });
			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: {
					live_stripe_connect: { account_id: "acct_preserved_live" },
					...(secretKey
						? {
								stripe_config: {
									test_api_key: encryptData("sk_test_preserved"),
									test_webhook_secret: encryptData("whsec_preserved"),
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
			const previousOrg = await OrgService.get({
				db: ctx.db,
				orgId: ctx.org.id,
			});
			await expectStripeRpcCorrect({
				response: await rpc({
					operation: "get_stripe_connection",
					body: { organization_slug, env: "test" },
				}),
				body: {
					connected: true,
					account_id: account.id,
					connected_at: previousOrg.test_stripe_connect?.connected_at ?? null,
				},
			});
			await expectStripeRpcCorrect({
				response: await rpc({
					operation: "disconnect_stripe",
					body: { organization_slug, env: "test" },
				}),
				body: { success: true },
			});
			const immediate = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
			expect(immediate.test_stripe_connect?.account_id).toBeUndefined();
			await expect(stripe.accounts.retrieve(account.id)).rejects.toMatchObject({
				code: "account_invalid",
			});
			await expectRevokedOAuthConfigCorrect({
				ctx,
				previousOrg,
				ordinary: false,
				keepMappings: secretKey,
				pendingRestoration: false,
			});
			await expectStripeRpcCorrect({
				response: await rpc({
					operation: "disconnect_stripe",
					body: { organization_slug, env: "test" },
				}),
				body: { success: true },
			});
			await expectStripeRpcCorrect({
				response: await rpc({
					operation: "get_stripe_connection",
					body: { organization_slug, env: "test" },
				}),
				body: { connected: false, account_id: null, connected_at: null },
			});
		} finally {
			await stripe.accounts.del(account.id).catch(() => {});
			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: {
					test_stripe_connect: ctx.org.test_stripe_connect,
					live_stripe_connect: {},
					stripe_config: null,
				},
			});
			await deletePlatformSubOrg({
				db: ctx.db,
				org: ctx.org,
				logger: ctx.logger,
				skipLiveCustomerCheck: true,
			});
		}
	}
}, 120_000);
