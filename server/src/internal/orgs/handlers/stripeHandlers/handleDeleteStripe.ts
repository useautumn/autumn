import {
	AppEnv,
	type Organization,
	type StripeConnectConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { orgToAccountId } from "@/external/connect/connectUtils.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { initMasterStripe } from "@/external/connect/initMasterStripe.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "../../OrgService.js";
import { clearOrgCache } from "../../orgUtils/clearOrgCache.js";
import { isStripeConnected } from "../../orgUtils.js";

export const disconnectStripe = async ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	if (isStripeConnected({ org, env, throughSecretKey: true })) {
		const stripeCli = createStripeCli({ org, env });
		const webhooks = await stripeCli.webhookEndpoints.list();
		for (const webhook of webhooks.data) {
			if (webhook.url.includes(org.id) && webhook.url.includes(env)) {
				await stripeCli.webhookEndpoints.del(webhook.id);
			}
		}
	}

	const accountId = orgToAccountId({ org, env, noDefaultAccount: true });

	if (accountId) {
		const masterStripe = initMasterStripe();
		await masterStripe.accounts.del(accountId);
	}
};

export const clearStripeConfig = async ({
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
			await disconnectStripe({ org, env });
		} catch (error) {
			logger.error(`Failed to disconnect stripe for ${org.id}, ${org.slug}`, {
				error,
			});
		}

		// Update stripe config:

		if (isStripeConnected({ org, env, throughSecretKey: true })) {
			await clearStripeConfig({ db, org, env });
		} else if (orgToAccountId({ org, env, noDefaultAccount: true })) {
			const newStripeConnect: StripeConnectConfig =
				structuredClone(org.stripe_connect) || {};

			if (env === AppEnv.Sandbox) {
				delete newStripeConnect.test_account_id;
			} else {
				delete newStripeConnect.live_account_id;
			}

			await OrgService.update({
				db,
				orgId: org.id,
				updates: {
					stripe_connect: newStripeConnect,
				},
			});
		}

		return c.json({});
	},
});
