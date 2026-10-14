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

	const stripeCustomer = await getOrCreateStripeCustomer({
		ctx,
		customer,
	});

	if (!stripeCustomer) {
		throw new InternalError({
			message: `Failed to create billing portal session for customer ${customer.id}, no stripe customer found`,
		});
	}

	const stripeCustomerId = stripeCustomer.id;

	try {
		return await stripeCli.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: returnUrl || toSuccessUrl({ org, env }),
			configuration: configurationId ?? undefined,
		});
	} catch (error: any) {
		if (configurationId) {
			throw error;
		}

		if (
			!error.message?.includes("default configuration has not been created")
		) {
			throw error;
		}

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

		return await stripeCli.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: returnUrl || toSuccessUrl({ org, env }),
			configuration: configuration.id,
		});
	}
};
