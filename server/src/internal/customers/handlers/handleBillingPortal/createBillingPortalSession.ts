import { type Customer, InternalError } from "@autumn/shared";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import { getOrCreateStripeCustomer } from "../../../../external/stripe/customers";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { toSuccessUrl } from "../../../orgs/orgUtils/convertOrgUtils";
import { createDefaultPortalConfig } from "./createDefaultPortalConfig";

export const createBillingPortalSession = async ({
	ctx,
	customer,
	returnUrl,
	configurationId,
}: {
	ctx: AutumnContext;
	customer: Customer;
	returnUrl?: string;
	configurationId?: string;
}) => {
	const { db, org, env, logger } = ctx;
	const stripeCli = createStripeCli({ org, env });

	// Determine the Stripe customer ID to use
	const stripeCustomer = await getOrCreateStripeCustomer({
		ctx,
		customer,
	});

	const stripeCustomerId = stripeCustomer.id;

	// 1. Try to create billing portal session

	try {
		return await stripeCli.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: returnUrl || toSuccessUrl({ org, env }),
			configuration: configurationId ?? undefined,
		});
	} catch (error: any) {
		// If configurationId was provided, don't fall back to default
		if (configurationId) {
			throw error;
		}

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
