import { type AppEnv, CusExpand, RecaseError } from "@autumn/shared";
import { ErrCode } from "@shared/enums/ErrCode.js";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { generateId } from "@/utils/genUtils.js";
import { createVercelSubscription } from "../../misc/createVercelSubscription.js";
import { productToBillingPlan } from "../handleListBillingPlans.js";

export const handleCreateResource = createRoute({
	body: z.object({
		productId: z.string().min(1),
		name: z.string().min(1),
		metadata: z.record(z.any()),
		billingPlanId: z.string().min(1),
		externalId: z.string().optional(),
		protocolSettings: z
			.object({
				experimentation: z
					.object({
						edgeConfigId: z.string().optional(),
					})
					.optional(),
			})
			.optional(),
	}),
	handler: async (c) => {
		const { orgId, env, integrationConfigurationId } = c.req.param();
		const { db, org, features, logger } = c.get("ctx");
		const { productId, name, metadata, billingPlanId } = c.req.valid("json");

		logger.info("Creating Vercel resource", {
			productId,
			name,
			billingPlanId,
			integrationConfigurationId,
		});

		// 1. Get customer
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
		}

		const stripeCli = await createStripeCli({ org, env: env as AppEnv });
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

		// 2. Create subscription (installation-level billing - same as UPDATE flow)
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

		// 3. Generate placeholder resource ID (no database storage yet)
		const resourceId = generateId("vre");

		// 4. Return resource response
		return c.json({
			id: resourceId,
			productId,
			name,
			metadata,
			status: "pending", // Will become "ready" after marketplace.invoice.paid confirms payment
			secrets: [
				{
					name: "AUTUMN_IS_AMAZING",
					value: `${new Date().toISOString()}-MAGIC`,
				},
			],
			billingPlan: {
				...productToBillingPlan({
					product,
					orgCurrency: org?.default_currency ?? "usd",
				}),
				scope: "installation", // Always installation-level
			},
			notification: {
				level: "info",
				title: "Resource provisioning",
				message: `Setting up ${name}...`,
			},
		});
	},
});
