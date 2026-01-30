import {
	AppEnv,
	type Organization,
	type StripeConnectConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { orgToAccountId } from "@/external/connect/connectUtils.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "../../OrgService.js";
import { clearOrgCache } from "../../orgUtils/clearOrgCache.js";
import { isStripeConnected } from "../../orgUtils.js";

const disconnectStripe = async ({
	org,
	env,
	logger,
}: {
	org: Organization;
	env: AppEnv;
	logger: Logger;
}) => {
	if (isStripeConnected({ org, env, throughSecretKey: true })) {
		const stripeCli = createStripeCli({ org, env, throughSecretKey: true });
		const webhooks = await stripeCli.webhookEndpoints.list();
		for (const webhook of webhooks.data) {
			if (webhook.url.includes(org.id) && webhook.url.includes(env)) {
				await stripeCli.webhookEndpoints.del(webhook.id);
			}
		}
	}

	const accountId = orgToAccountId({ org, env, noDefaultAccount: true });

	if (accountId) {
		const masterStripe = initMasterStripe({ env });

		// OAuth-connected accounts must be deauthorized, not deleted
		// Platform-managed accounts can be deleted
		try {
			await masterStripe.oauth.deauthorize({
				client_id:
					env === AppEnv.Live
						? process.env.STRIPE_LIVE_CLIENT_ID || ""
						: process.env.STRIPE_SANDBOX_CLIENT_ID || "",
				stripe_user_id: accountId,
			});
		} catch (error) {
			// If deauthorization fails, the account might have already been disconnected
			// or it's a platform-managed account that needs to be deleted
			logger.error(
				"Failed to deauthorize account, attempting deletion:",
				error,
			);
		}
	}
};

const clearStripeConfig = async ({
	db,
	org,
	env,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
}) => {
	const newStripeConfig: any = structuredClone(org.stripe_config) || {};

	if (env === AppEnv.Sandbox) {
		newStripeConfig.test_api_key = null;
	} else {
		newStripeConfig.live_api_key = null;
	}

	await OrgService.update({
		db,
		orgId: org.id,
		updates: {
			stripe_config: newStripeConfig,
		},
	});
};

export const handleDeleteStripe = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger, env } = ctx;

		await clearOrgCache({
			db,
			orgId: org.id,
			logger,
		});

		try {
			await disconnectStripe({ org, env, logger });
		} catch (error) {
			logger.error(`Failed to disconnect stripe for ${org.id}, ${org.slug}`, {
				error,
			});
		}

		// Update stripe config:

		if (isStripeConnected({ org, env, throughSecretKey: true })) {
			await clearStripeConfig({ db, org, env });
		} else if (orgToAccountId({ org, env, noDefaultAccount: true })) {
			if (env === AppEnv.Sandbox) {
				const newStripeConnect: StripeConnectConfig =
					structuredClone(org.test_stripe_connect) || {};
				delete newStripeConnect.account_id;

				await OrgService.update({
					db,
					orgId: org.id,
					updates: {
						test_stripe_connect: newStripeConnect,
					},
				});
			} else {
				const newStripeConnect: StripeConnectConfig =
					structuredClone(org.live_stripe_connect) || {};
				delete newStripeConnect.account_id;

				await OrgService.update({
					db,
					orgId: org.id,
					updates: {
						live_stripe_connect: newStripeConnect,
					},
				});
			}
		}

		return c.json({});
	},
});
