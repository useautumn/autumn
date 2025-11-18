import {
	AppEnv,
	CusExpand,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import { ErrCode } from "@shared/enums/ErrCode.js";
import { DrizzleError } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { sendCustomSvixEvent } from "@/external/svix/svixHelpers.js";
import { createVercelSubscription } from "@/external/vercel/misc/vercelSubscriptions.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { generateId } from "@/utils/genUtils.js";
import {
	type VercelResourceCreatedEvent,
	VercelWebhooks,
} from "../../misc/vercelWebhookTypes.js";
import { productToBillingPlan } from "../handleListBillingPlans.js";

export const handleCreateResource = createRoute({
	body: z.object({
		productId: z.string().min(1),
		name: z.string().min(1),
		metadata: z.record(z.any(), z.any()),
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

		const stripeCli = createStripeCli({ org, env: env as AppEnv });
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

		// 2. Create resource in database (enforces 1-resource limit)
		const resourceId = generateId("vre");

		try {
			const product = await db.transaction(async (tx) => {
				await VercelResourceService.create({
					db: tx as unknown as DrizzleCli,
					resource: {
						id: resourceId,
						org_id: orgId,
						env: env as AppEnv,
						installation_id: integrationConfigurationId,
						name,
						status: "pending",
						metadata: metadata ?? {},
					},
				});

				let createdProduct: FullProduct;

				try {
					// 3. Create subscription (installation-level billing)
					const { product } = await createVercelSubscription({
						db: tx as unknown as DrizzleCli,
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
						metadata,
						resourceId,
					});

					createdProduct = product;
				} catch (error) {
					tx.rollback();
					throw error;
				}

				return createdProduct;
			});

			await sendCustomSvixEvent({
				appId:
					org.processor_configs?.vercel?.svix?.[
						env === AppEnv.Live ? "live_id" : "sandbox_id"
					] ?? "",
				org,
				env: env as AppEnv,
				eventType: VercelWebhooks.ResourceProvisioned,
				data: {
					resource: {
						id: resourceId,
						name,
					},
					installation_id: integrationConfigurationId,
					access_token: customer.processors?.vercel?.access_token ?? "",
				} satisfies VercelResourceCreatedEvent,
			});

			// 4. Return resource response
			return c.json({
				id: resourceId,
				productId,
				name,
				metadata,
				status: "pending", // Will become "ready" after marketplace.invoice.paid confirms payment
				billingPlan: {
					...productToBillingPlan({
						product,
						orgCurrency: org?.default_currency ?? "usd",
					}),
					scope: "installation", // Always installation-level
				},
				secrets: [],
				notification: {
					level: "info",
					title: "Resource provisioning",
					message: `Setting up ${name}...`,
				},
			});
		} catch (error) {
			return c.json(
				{
					error: {
						code: "conflict",
						message:
							error instanceof DrizzleError
								? error.message.includes("Rollback")
									? "An error occurred while creating the resource's subscription"
									: error.message
								: error instanceof RecaseError
									? error.message
									: "An error occurred while creating the resource",
						user: null,
					},
				},
				StatusCodes.CONFLICT,
			);
		}
	},
});
