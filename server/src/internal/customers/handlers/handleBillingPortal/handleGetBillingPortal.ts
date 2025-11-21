import {
	ErrCode,
	GetBillingPortalBodySchema,
	GetBillingPortalQuerySchema,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import z from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import { createStripeCusIfNotExists } from "../../../../external/stripe/stripeCusUtils";
import { routeHandler } from "../../../../utils/routerUtils";
import { OrgService } from "../../../orgs/OrgService";
import { toSuccessUrl } from "../../../orgs/orgUtils/convertOrgUtils";
import { CusService } from "../../CusService";

export const handleGetBillingPortal = (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "get billing portal",
		handler: async (req, res) => {
			const returnUrl = req.query.return_url;
			const customerId = req.params.customer_id;
			const [org, customer] = await Promise.all([
				OrgService.getFromReq(req),
				CusService.get({
					db: req.db,
					idOrInternalId: customerId,
					orgId: req.orgId,
					env: req.env,
				}),
			]);

			if (!customer) {
				throw new RecaseError({
					message: `Customer ${customerId} not found`,
					code: ErrCode.CustomerNotFound,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}

			const stripeCli = createStripeCli({ org, env: req.env });

			let stripeCusId: string = customer.processor?.id;
			if (!customer.processor?.id) {
				const newCus = await createStripeCusIfNotExists({
					db: req.db,
					org,
					env: req.env,
					customer,
					logger: req.logger,
				});

				if (!newCus) {
					throw new RecaseError({
						message: `Failed to create Stripe customer`,
					});
				}

				stripeCusId = newCus.id;
			}

			const portal = await stripeCli.billingPortal.sessions.create({
				customer: stripeCusId,
				return_url: returnUrl || toSuccessUrl({ org, env: req.env }),
			});

			res.status(200).json({
				customer_id: customer.id || null,
				url: portal.url,
			});
		},
	});

export const handleGetBillingPortalV2 = createRoute({
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
			throw new RecaseError({
				message: `Customer ${customerId} not found`,
				code: ErrCode.CustomerNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		const stripeCli = createStripeCli({ org, env: env });

		let stripeCusId: string = customer.processor?.id;
		if (!customer.processor?.id) {
			const newCus = await createStripeCusIfNotExists({
				db,
				org,
				env,
				customer,
				logger,
			});

			if (!newCus) {
				throw new RecaseError({
					message: `Failed to create Stripe customer`,
				});
			}

			stripeCusId = newCus.id;
		}

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

		const portal = await stripeCli.billingPortal.sessions.create({
			customer: stripeCusId,
			return_url: returnUrl ?? toSuccessUrl({ org, env }),
			configuration: configuration?.id ?? undefined,
		});

		return c.json({
			customer_id: customer.id || null,
			url: portal.url,
		});
	},
});
