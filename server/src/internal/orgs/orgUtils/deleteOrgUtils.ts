import { AppEnv, type Organization } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	deauthorizeAccount,
	deleteConnectedAccount,
} from "@/external/connect/connectUtils.js";
import { deleteSvixApp } from "@/external/svix/svixHelpers.js";
import { deleteStripeWebhook } from "../orgUtils.js";

export const deleteSvixWebhooks = async ({
	org,
	logger,
}: {
	org: Organization;
	logger: Logger;
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

export const deleteStripeWebhooks = async ({
	org,
	logger,
}: {
	org: Organization;
	logger: Logger;
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
