import { ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { toSuccessUrl } from "@/internal/orgs/orgUtils/convertOrgUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";

const createDefaultBillingPortalConfiguration = async (stripeCli: Stripe) => {
	try {
		const configuration = await stripeCli.billingPortal.configurations.create({
			features: {
				customer_update: {
					allowed_updates: ["email", "address"],
					enabled: true,
				},
				invoice_history: {
					enabled: true,
				},
				payment_method_update: {
					enabled: true,
				},
				subscription_cancel: {
					enabled: true,
				},
			},
			// business_profile: {
			//   privacy_policy_url: "https://example.com/privacy",
			//   terms_of_service_url: "https://example.com/terms",
			// },
		});
		return configuration;
	} catch (error: any) {
		throw new RecaseError({
			message: `Failed to create billing portal configuration: ${error.message}`,
			code: ErrCode.StripeError,
			statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
		});
	}
};

export const handleCreateBillingPortal = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "create_billing_portal",
		handler: async (req: any, res: any) => {
			const customerId = req.params.customer_id || req.body.customer_id;
			const returnUrl = req.body.return_url;

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

			// Determine the Stripe customer ID to use
			let stripeCustomerId: string;

			if (!customer.processor?.id) {
				try {
					const newCus = await createStripeCusIfNotExists({
						db: req.db,
						org,
						env: req.env,
						customer,
						logger: req.logtail,
					});

					if (!newCus) {
						throw new RecaseError({
							message: `Failed to create Stripe customer`,
							code: ErrCode.StripeError,
							statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
						});
					}

					stripeCustomerId = newCus.id;
				} catch (error: any) {
					throw new RecaseError({
						message: `Failed to create Stripe customer`,
						code: ErrCode.StripeError,
						statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
					});
				}
			} else {
				stripeCustomerId = customer.processor.id;
			}

			// Create billing portal session
			let portal;
			try {
				portal = await stripeCli.billingPortal.sessions.create({
					customer: stripeCustomerId,
					return_url: returnUrl || toSuccessUrl({ org, env: req.env }),
				});
			} catch (error: any) {
				console.log(`Code: ${error.code}, Message: ${error.message}`);

				// Check if the error is due to missing default configuration
				if (
					error.message?.includes("default configuration has not been created")
				) {
					try {
						// Create a default billing portal configuration
						req.logtail?.info(
							`Creating default billing portal configuration for customer ${customer.id}`,
						);

						const configuration =
							await createDefaultBillingPortalConfiguration(stripeCli);

						req.logtail?.info(
							"Successfully created billing portal configuration",
							{
								configurationId: configuration.id,
								orgId: org.id,
							},
						);

						// Retry creating the portal session with the new configuration
						portal = await stripeCli.billingPortal.sessions.create({
							customer: stripeCustomerId,
							return_url: returnUrl || toSuccessUrl({ org, env: req.env }),
							configuration: configuration.id,
						});
					} catch (configError: any) {
						req.logtail?.error(
							"Failed to create billing portal configuration",
							{
								error: configError.message,
								orgId: org.id,
							},
						);
						throw new RecaseError({
							message: `Failed to create billing portal configuration: ${configError.message}`,
							code: ErrCode.StripeError,
							statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
						});
					}
				} else {
					throw error;
				}
			}

			res.status(200).json({
				customer_id: customer.id,
				url: portal.url,
			});
		},
	});
