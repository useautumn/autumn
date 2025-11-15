import { type AppEnv, CusExpand, RecaseError } from "@autumn/shared";
import { ErrCode } from "@shared/enums/ErrCode.js";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createVercelSubscription } from "@/external/vercel/misc/vercelSubscriptions.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { VercelError, VercelNotification } from "../misc/vercelTypes.js";
import { productToBillingPlan } from "./handleListBillingPlans.js";

export const handleUpdateVercelBillingPlan = createRoute({
	body: z.object({
		billingPlanId: z.string().min(1),
	}),
	// assertIdempotence: "Idempotency-Key",
	handler: async (c) => {
		const { orgId, env, integrationConfigurationId } = c.req.param();
		const { db, org, features, logger } = c.get("ctx");

		const { billingPlanId } = c.req.valid("json");

		const customer = await CusService.getFull({
			db,
			idOrInternalId: integrationConfigurationId,
			orgId,
			env: env as AppEnv,
			expand: [CusExpand.Entities],
		});

		if (!customer) {
			throw new RecaseError({
				message: `Customer not found for Vercel installation ${integrationConfigurationId}`,
				code: ErrCode.CustomerNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		} else {
			if (
				customer.customer_products.find((cp) => cp.product_id === billingPlanId)
			) {
				return c.json(
					{
						error: {
							code: "validation_error",
							message: "You already have this billing plan",
							user: {
								message: "You already have this billing plan",
							},
						},
					} satisfies VercelError,
					StatusCodes.BAD_REQUEST,
				);
			}

			const stripeCli = await createStripeCli({
				org,
				env: env as AppEnv,
			});

			const stripeCustomer = await stripeCli.customers.retrieve(
				customer.processor.id,
				{
					expand: ["subscriptions"],
				},
			);

			if (stripeCustomer.deleted) {
				throw new RecaseError({
					message: `Customer ${customer.processor.id} is deleted`,
					code: ErrCode.CustomerNotFound,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}

			const existingSubscription = stripeCustomer.subscriptions?.data.find(
				(s) => s.metadata.vercel_installation_id === integrationConfigurationId,
			);

			if (!existingSubscription && billingPlanId === "cancel_plan") {
				return c.json({
					notification: {
						level: "error",
						title: "You cannot cancel your plan",
						message: `You cannot cancel your plan. You don't have an active subscription.`,
					},
				});
			}

			if (!existingSubscription) {
				// New subscription flow - create installation-level subscription
				const { product } = await createVercelSubscription({
					db,
					org,
					env: env as AppEnv,
					customer,
					stripeCustomer,
					stripeCli,
					integrationConfigurationId,
					billingPlanId,
					features,
					logger,
					c,
				});

				return c.json({
					billingPlan: productToBillingPlan({
						product,
						orgCurrency: org?.default_currency ?? "usd",
					}),
					notification: {
						level: "info",
						title: "Billing plan provisioning",
						message: `Setting up ${product?.name} plan...`,
					},
				});
			}

			if (existingSubscription && billingPlanId === "cancel_plan") {
				await stripeCli.subscriptions.cancel(existingSubscription.id);
				return c.json({
					notification: {
						level: "info",
						title: "Succesfully cancelled plan",
						message: `You have successfully cancelled your plan. You will no longer be charged or have access to this plan.`,
					} satisfies VercelNotification,
				});
			}

			// TODO: Handle upgrade/downgrade when existingSubscription exists
			// Compare billingPlanId with existingSubscription.metadata.vercel_billing_plan_id
			// If higher tier → upgrade (updateStripeSub2), if lower tier → downgrade
			return c.json({
				notification: {
					level: "error",
					title: "Plan changes are not supported",
					message: `Plan upgrades/downgrades are unsupported. Please contact support.`,
				},
			});
		}
	},
});
