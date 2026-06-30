import {
	AppEnv,
	findActiveCustomerProductById,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	isFreeProduct,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { ErrCode } from "@shared/enums/ErrCode.js";
import { format } from "date-fns";
import { DrizzleError } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { z } from "zod/v4";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { sendCustomSvixEvent } from "@/external/svix/svixHelpers.js";
import { provisionVercelCusProduct } from "@/external/vercel/misc/vercelProvisioning.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import { PlanService } from "@/internal/products/PlanService.js";
import { generateId } from "@/utils/genUtils.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";
import {
	type VercelResourceCreatedEvent,
	VercelWebhooks,
} from "../../misc/vercelWebhookTypes.js";
import { productToBillingPlan } from "../handleListBillingPlans.js";

const findInstallationCusProduct = async ({
	ctx,
	fullCustomer,
	stripeCustomer,
	integrationConfigurationId,
	freeProduct,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	stripeCustomer: Stripe.Customer;
	integrationConfigurationId: string;
	freeProduct?: FullProduct;
}): Promise<FullCusProduct | undefined> => {
	const { db, org, env } = ctx;

	const existingSub = stripeCustomer.subscriptions?.data.find(
		(s) =>
			s.metadata.vercel_installation_id === integrationConfigurationId &&
			s.status !== "incomplete_expired" &&
			s.status !== "canceled",
	);

	if (existingSub) {
		const existingCusProducts = await customerProductRepo.getByStripeSubId({
			db,
			stripeSubId: existingSub.id,
			orgId: org.id,
			env,
		});

		if (existingCusProducts.length > 0) {
			return existingCusProducts[0];
		}

		throw new RecaseError({
			message: "Vercel subscription is still being provisioned. Retry shortly.",
			code: "vercel_provisioning_in_flight",
			statusCode: StatusCodes.CONFLICT,
		});
	}

	if (freeProduct) {
		return findActiveCustomerProductById({
			fullCus: fullCustomer,
			productId: freeProduct.id,
		});
	}

	return undefined;
};

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
		const appEnv = env as AppEnv;

		if (!customer) {
			throw new RecaseError({
				message: `Customer not found for Vercel installation ${integrationConfigurationId}`,
				code: ErrCode.CustomerNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		const stripeCli = createStripeCli({ org, env: appEnv });
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

		const loadProduct = async (planId: string): Promise<FullProduct> => {
			const product = await PlanService.getFull({
				db,
				orgId,
				env: appEnv,
				idOrInternalId: planId,
			});
			if (!product) {
				throw new RecaseError({
					message: `Product not found for billing plan ${planId}`,
					code: ErrCode.ProductNotFound,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}
			return product;
		};

		const buildResourceResponse = ({
			resourceId,
			product,
		}: {
			resourceId: string;
			product: FullProduct;
		}) => ({
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

		try {
			const requestedProduct = await loadProduct(billingPlanId);
			const freeProduct = isFreeProduct({ prices: requestedProduct.prices })
				? requestedProduct
				: undefined;

			const existing = await VercelResourceService.getByInstallationAndName({
				db,
				installationId: integrationConfigurationId,
				name,
				orgId,
				env: appEnv,
			});

			const installationCusProduct = await findInstallationCusProduct({
				ctx,
				fullCustomer: customer,
				stripeCustomer,
				integrationConfigurationId,
				freeProduct,
			});

			if (existing) {
				const product = installationCusProduct
					? await loadProduct(installationCusProduct.product_id)
					: requestedProduct;
				return c.json(
					buildResourceResponse({ resourceId: existing.id, product }),
				);
			}

			const resourceId = generateId("vre");
			try {
				await VercelResourceService.create({
					db,
					resource: {
						id: resourceId,
						org_id: orgId,
						env: appEnv,
						installation_id: integrationConfigurationId,
						name,
						status: "ready",
						metadata: metadata ?? {},
					},
				});
			} catch (error) {
				// Lost the create race against a concurrent request for the same
				// (installation_id, name). Re-read and return the winner idempotently.
				if (!isUniqueConstraintError(error)) throw error;
				const winner =
					await VercelResourceService.getByInstallationAndName({
						db,
						installationId: integrationConfigurationId,
						name,
						orgId,
						env: appEnv,
					});
				if (!winner) throw error;
				const product = installationCusProduct
					? await loadProduct(installationCusProduct.product_id)
					: requestedProduct;
				return c.json(
					buildResourceResponse({ resourceId: winner.id, product }),
				);
			}

			const product = installationCusProduct
				? installationCusProduct.product_id === billingPlanId
					? requestedProduct
					: await loadProduct(installationCusProduct.product_id)
				: (
						await provisionVercelCusProduct({
							ctx,
							customer,
							stripeCustomer,
							stripeCli,
							integrationConfigurationId,
							billingPlanId,
							resourceId,
							metadata,
						})
					).product;

			if (installationCusProduct) {
				logger.info(
					"[handleCreateResource] Reusing installation-level cus_product",
					{
						data: {
							resourceId,
							installationCusProductId: installationCusProduct.id,
							requestedBillingPlanId: billingPlanId,
							actualProductId: installationCusProduct.product_id,
							installationId: integrationConfigurationId,
						},
					},
				);
			}

			await sendCustomSvixEvent({
				appId:
					org.processor_configs?.vercel?.svix?.[
						env === AppEnv.Live ? "live_id" : "sandbox_id"
					] ?? "",
				org,
				env: appEnv,
				eventType: VercelWebhooks.ResourceProvisioned,
				data: {
					resource: {
						id: resourceId,
						name,
					},
					installation_id: integrationConfigurationId,
					access_token: customer.processors?.vercel?.access_token ?? "",
				} satisfies VercelResourceCreatedEvent,
				idempotencyKey: `${format(new Date(), "ddMMyyyy")}:${integrationConfigurationId}:${name}:resource-provisioned`,
			});

			return c.json(buildResourceResponse({ resourceId, product }));
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
