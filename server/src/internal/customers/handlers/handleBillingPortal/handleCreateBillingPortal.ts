import {
	CustomerNotFoundError,
	GetBillingPortalBodySchema,
	GetBillingPortalQuerySchema,
} from "@autumn/shared";
import type Stripe from "stripe";
import z from "zod/v4";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { OrgService } from "../../../orgs/OrgService";
import { CusService } from "../../CusService";
import { createBillingPortalSession } from "./createBillingPortalSession";

export const handleCreateBillingPortal = createRoute({
	query: GetBillingPortalQuerySchema,
	params: z.object({
		customer_id: z.string(),
	}),
	body: GetBillingPortalBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env, logger } = ctx;
		const { return_url: returnUrl } = c.req.valid("query");
		const { customer_id: customerId } = c.req.param();
		const { billing_portal_params: billingPortalParams = {} } =
			c.req.valid("json") ?? {};

		const customer = await CusService.get({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env,
		});

		if (!customer) {
			throw new CustomerNotFoundError({ customerId });
		}

		const stripeCli = createStripeCli({ org, env });

		// Retrieve existing configuration if org has one saved
		let configuration: Stripe.BillingPortal.Configuration | undefined;
		if (org?.stripe_config?.billing_portal_configuration_id) {
			try {
				configuration = await stripeCli.billingPortal.configurations.retrieve(
					org.stripe_config.billing_portal_configuration_id,
				);
			} catch (_) {
				logger.error(
					`Failed to retrieve billing portal configuration ${org.stripe_config.billing_portal_configuration_id} for org ${org.slug}`,
					{
						error: _,
					},
				);
				configuration = undefined;
			}
		}

		// Create new configuration from params if provided and no config exists
		// For now, ignore new configuration creation if one already exists.
		// TODO: Handle updates to existing configuration.
		if (Object.keys(billingPortalParams).length > 0 && !configuration?.id) {
			try {
				configuration = await stripeCli.billingPortal.configurations.create(
					billingPortalParams as Stripe.BillingPortal.ConfigurationCreateParams,
				);

				if (configuration?.id) {
					await OrgService.update({
						db,
						orgId: org.id,
						updates: {
							stripe_config: {
								...(org.stripe_config || {}),
								billing_portal_configuration_id: configuration.id,
							},
						},
					});
				}
			} catch (_) {
				logger.error(
					`Failed to create billing portal configuration for org ${org.slug}`,
					{
						error: _,
					},
				);
				configuration = undefined;
			}
		}

		const session = await createBillingPortalSession({
			ctx,
			customer,
			returnUrl,
			configurationId: configuration?.id,
		});

		return c.json({
			customer_id: customer.id || null,
			url: session.url,
		});
	},
});
