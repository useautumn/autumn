import { AppEnv, type Organization } from "@autumn/shared";
import {
	deauthorizeAccount,
	deleteConnectedAccount,
} from "@/external/connect/connectUtils.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { deleteSvixApp } from "@/external/svix/svixHelpers.js";
import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import { deleteOrg } from "../../deleteOrg/deleteOrg.js";
import { deleteStripeWebhook } from "../../orgUtils.js";

const deleteSvixWebhooks = async ({
	org,
	logger,
}: {
	org: Organization;
	logger: any;
}) => {
	const batch = [];
	if (org.svix_config?.sandbox_app_id) {
		batch.push(
			deleteSvixApp({
				appId: org.svix_config.sandbox_app_id,
			}),
		);
	}

	if (org.svix_config?.live_app_id) {
		batch.push(
			deleteSvixApp({
				appId: org.svix_config.live_app_id,
			}),
		);
	}

	try {
		await Promise.all(batch);
	} catch (error) {
		logger.error(`Failed to delete svix webhooks for ${org.id}, ${org.slug}`);
	}
};

const deleteStripeWebhooks = async ({
	org,
	logger,
}: {
	org: Organization;
	logger: any;
}) => {
	try {
		await deleteStripeWebhook({
			org: org,
			env: AppEnv.Sandbox,
		});

		await deleteStripeWebhook({
			org: org,
			env: AppEnv.Live,
		});
	} catch (error: any) {
		logger.error(
			`Failed to delete stripe webhooks for ${org.id}, ${org.slug}. ${error.message})`,
		);
	}
};

export const deleteStripeAccounts = async ({
	org,
	logger,
}: {
	org: Organization;
	logger: Logger;
}) => {
	if (org.test_stripe_connect?.account_id) {
		await deauthorizeAccount({
			accountId: org.test_stripe_connect.account_id,
			env: AppEnv.Sandbox,
			logger,
		});
	}

	if (org.live_stripe_connect?.account_id) {
		await deauthorizeAccount({
			accountId: org.live_stripe_connect.account_id,
			env: AppEnv.Live,
			logger,
		});
	}

	if (org.test_stripe_connect?.default_account_id) {
		await deleteConnectedAccount({
			accountId: org.test_stripe_connect.default_account_id,
			env: AppEnv.Sandbox,
			logger,
		});
	}
};

export const handleDeleteOrg = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, db, logger } = ctx;

		await deleteOrg({
			org,
			db,
			logger,
			deleteOrgFromDb: false,
		});

		return c.json({
			message: "Org deleted",
		});
	},
});
