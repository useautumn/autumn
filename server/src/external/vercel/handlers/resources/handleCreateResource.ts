import { AppEnv, CusProductStatus, RecaseError, Scopes } from "@autumn/shared";
import { ErrCode } from "@shared/enums/ErrCode.js";
import { DrizzleError } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { sendCustomSvixEvent } from "@/external/svix/svixHelpers.js";
import { provisionVercelCusProduct } from "@/external/vercel/misc/vercelProvisioning.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";
import {
	type VercelResourceCreatedEvent,
	VercelWebhooks,
} from "../../misc/vercelWebhookTypes.js";
import { productToBillingPlan } from "../handleListBillingPlans.js";

export const handleCreateResource = createRoute({
	scopes: [Scopes.Public],
	body: z.object({
		productId: z.string().min(1),
		name: z.string().min(1),
		metadata: z.record(z.any(), z.any()).optional().default({}),
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
		const ctx = c.get("ctx");
		const { db, org, logger, fullCustomer: customer } = ctx;
		const { productId, name, metadata, billingPlanId } = c.req.valid("json");

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

		try {
			// Idempotency: check if a resource already exists for this installation
			const existingResource = await VercelResourceService.getByInstallation({
				db,
				installationId: integrationConfigurationId,
				orgId,
				env: env as AppEnv,
			});

			let resourceId: string;

			const buildResourceResponse = (
				product: Awaited<ReturnType<typeof ProductService.getFull>>,
			) => ({
				id: resourceId,
				productId,
				name,
				metadata,
				status: "ready",
				billingPlan: {
					...productToBillingPlan({
						product,
						orgCurrency: org?.default_currency ?? "usd",
					}),
					scope: "installation",
				},
				secrets: [],
				notification: {
					level: "info",
					title: "Resource provisioning",
					message: `Setting up ${name}...`,
				},
			});

			if (existingResource) {
				resourceId = existingResource.id;

				const existingSub = stripeCustomer.subscriptions?.data.find(
					(s) =>
						s.metadata.vercel_resource_id === existingResource.id &&
						s.status !== "incomplete_expired" &&
						s.status !== "canceled",
				);

				if (existingSub) {
					const existingCusProducts =
						await customerProductRepo.getByStripeSubId({
							db,
							stripeSubId: existingSub.id,
							orgId,
							env: env as AppEnv,
						});

					if (existingCusProducts.length > 0) {
						const product = await ProductService.getFull({
							db,
							orgId,
							env: env as AppEnv,
							idOrInternalId: billingPlanId,
						});
						if (!product) {
							throw new RecaseError({
								message: `Product not found for billing plan ${billingPlanId}`,
								code: ErrCode.ProductNotFound,
								statusCode: StatusCodes.NOT_FOUND,
							});
						}
						return c.json(buildResourceResponse(product));
					}
				}
				// Resource exists but no cus_product (or no sub) -> fall through to provision
			} else {
				// No resource -> create it
				resourceId = generateId("vre");
				await VercelResourceService.createOrBlockIfOthersExist({
					db,
					resource: {
						id: resourceId,
						org_id: orgId,
						env: env as AppEnv,
						installation_id: integrationConfigurationId,
						name,
						status: "ready",
						metadata: metadata ?? {},
					},
				});
			}

			// Customer-already-on-this-plan short-circuit. Installations auto-attach
			// the org's default free plan, so picking that same plan in the Vercel UI
			// would otherwise hit V2 attach's same-product guard. Skip Stripe sub
			// creation + Autumn insertion entirely — only the resource link is needed.
			const sameProductCusProduct = customer.customer_products.find(
				(cp) =>
					cp.product_id === billingPlanId &&
					(cp.status === CusProductStatus.Active ||
						cp.status === CusProductStatus.Trialing ||
						cp.status === CusProductStatus.PastDue),
			);

			if (sameProductCusProduct) {
				const product = await ProductService.getFull({
					db,
					orgId,
					env: env as AppEnv,
					idOrInternalId: billingPlanId,
				});
				if (!product) {
					throw new RecaseError({
						message: `Product not found for billing plan ${billingPlanId}`,
						code: ErrCode.ProductNotFound,
						statusCode: StatusCodes.NOT_FOUND,
					});
				}

				ctx.logger.info(
					"[handleCreateResource] Customer already on plan, creating resource without provisioning",
					{
						data: {
							billingPlanId,
							cusProductId: sameProductCusProduct.id,
							resourceId,
							installationId: integrationConfigurationId,
						},
					},
				);

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

				return c.json(buildResourceResponse(product));
			}

			const { product } = await provisionVercelCusProduct({
				ctx,
				customer,
				stripeCustomer,
				stripeCli,
				integrationConfigurationId,
				billingPlanId,
				resourceId,
				metadata,
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

			return c.json(buildResourceResponse(product));
		} catch (error) {
			logCaughtError({
				logger,
				message: "[vercel/resources.create] FAILED",
				error,
				data: { integrationConfigurationId },
			});
			return c.json(
				{
					error: {
						code: "conflict",
						message:
							error instanceof DrizzleError
								? error.message
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
