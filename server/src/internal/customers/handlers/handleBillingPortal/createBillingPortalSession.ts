import { type Customer, InternalError } from "@autumn/shared";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import { createStripeCusIfNotExists } from "../../../../external/stripe/stripeCusUtils";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { toSuccessUrl } from "../../../orgs/orgUtils/convertOrgUtils";
import { createDefaultPortalConfig } from "./createDefaultPortalConfig";

export const createBillingPortalSession = async ({
	ctx,
	customer,
	returnUrl,
}: {
	ctx: AutumnContext;
	customer: Customer;
	returnUrl?: string;
}) => {
	const { db, org, env, logger } = ctx;
	const stripeCli = createStripeCli({ org, env });

	// Determine the Stripe customer ID to use
	let stripeCustomerId: string;

	if (!customer.processor?.id) {
		const newCus = await createStripeCusIfNotExists({
			db,
			org,
			env,
			customer,
			logger,
		});

		if (!newCus) {
			throw new InternalError({
				message: `Failed to create Stripe customer`,
			});
		}

		stripeCustomerId = newCus.id;
	} else {
		stripeCustomerId = customer.processor.id;
	}

	// 1. Try to create billing portal session
	try {
		return await stripeCli.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: returnUrl || toSuccessUrl({ org, env }),
		});
	} catch (error: any) {
		// If not a missing configuration error, rethrow
		if (
			!error.message?.includes("default configuration has not been created")
		) {
			throw error;
		}

		// Handle missing configuration by creating default and retrying
		logger.info(
			`Creating default billing portal configuration for customer ${customer.id}`,
		);

		const configuration = await createDefaultPortalConfig(stripeCli).catch(
			(configError: any) => {
				logger.error("Failed to create billing portal configuration", {
					error: configError.message,
					orgId: org.id,
				});
				throw new InternalError({
					message: `Failed to create billing portal configuration: ${configError.message}`,
				});
			},
		);

		logger.info("Successfully created billing portal configuration", {
			configurationId: configuration.id,
			orgId: org.id,
		});

		// Retry with new configuration
		return await stripeCli.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: returnUrl || toSuccessUrl({ org, env }),
			configuration: configuration.id,
		});
	}
};
