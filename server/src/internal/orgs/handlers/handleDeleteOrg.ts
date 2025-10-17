import { AppEnv, customers, ErrCode, type Organization } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { Response } from "express";
import Stripe from "stripe";
import { initMasterStripe } from "@/external/connect/initMasterStripe.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { deleteSvixApp } from "@/external/svix/svixHelpers.js";
import RecaseError, { handleFrontendReqError } from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { deleteStripeWebhook } from "../orgUtils.js";

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

const deleteStripeAccounts = async ({
	org,
	logger,
}: {
	org: Organization;
	logger: Logger;
}) => {
	const stripe = initMasterStripe();

	if (org.stripe_connect.test_account_id) {
		try {
			await stripe.accounts.del(org.stripe_connect.test_account_id);
		} catch (error) {
			if (error instanceof Stripe.errors.StripeError) {
				logger.error(
					`Failed to delete stripe test acocunt ID for ${org.id}, ${org.slug}. ${error.message})`,
				);
			}
		}
	}

	if (org.stripe_connect.live_account_id) {
		try {
			await stripe.accounts.del(org.stripe_connect.live_account_id);
		} catch (error) {
			if (error instanceof Stripe.errors.StripeError) {
				logger.error(
					`Failed to delete stripe live account ID for ${org.id}, ${org.slug}. ${error.message})`,
				);
			}
		}
	}

	if (org.stripe_connect.default_account_id) {
		try {
			await stripe.accounts.del(org.stripe_connect.default_account_id);
		} catch (error) {
			if (error instanceof Stripe.errors.StripeError) {
				logger.error(
					`Failed to delete stripe default account ID for ${org.id}, ${org.slug}. ${error.message})`,
				);
			}
		}
	}
};

export const handleDeleteOrg = async (req: ExtendedRequest, res: Response) => {
	try {
		const { org, db, logger } = req;

		// 1. Check if any customers
		const hasCustomers = await db.query.customers.findFirst({
			where: and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Live)),
		});

		if (hasCustomers)
			throw new RecaseError({
				message: "Cannot delete org with production mode customers",
				code: ErrCode.OrgHasCustomers,
				statusCode: 400,
			});

		// 2. Delete svix webhooks
		logger.info("1. Deleting svix webhooks");
		await deleteSvixWebhooks({ org, logger });

		// 3. Delete stripe webhooks
		logger.info("2. Deleting stripe webhooks");
		await deleteStripeWebhooks({ org, logger });

		// 4. Delete stripe accounts
		logger.info("3. Deleting stripe accounts");
		await deleteStripeAccounts({ org, logger });

		// 4. Delete all sandbox customers
		logger.info("4. Deleting sandbox customers");
		await db
			.delete(customers)
			.where(
				and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Sandbox)),
			);

		res.status(200).json({
			message: "Org deleted",
		});
	} catch (error) {
		handleFrontendReqError({
			res,
			error,
			req,
			action: "delete-org",
		});
	}
};
