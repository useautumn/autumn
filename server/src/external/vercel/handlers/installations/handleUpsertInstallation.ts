import {
	AppEnv,
	type Customer,
	cusProductToProduct,
	ProcessorType,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripeCustomer } from "@/external/stripe/customers";
import { createCustomStripeCard } from "@/external/stripe/stripeCardUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerActions } from "@/internal/customers/actions/index.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	AuthError,
	getAuthorizationToken,
	verifyClaims,
	verifyToken,
} from "../../misc/vercelAuth.js";
import type { VercelUpsertInstallation } from "../../misc/vercelTypes.js";
import { productToBillingPlan } from "../handleListBillingPlans.js";

export const handleUpsertInstallation = createRoute({
	handler: async (c) => {
		const body = await c.req.json<VercelUpsertInstallation>();
		const ctx = c.get("ctx");
		const { integrationConfigurationId } = c.req.param();
		const { logger } = ctx;
		let createdCustomer: Customer | null = null;

		try {
			const token = getAuthorizationToken(
				c.req.header("Authorization") as string,
			);
			const claims = await verifyToken({ token, org: ctx.org, env: ctx.env });

			if (
				!verifyClaims({
					claims,
					org: ctx.org,
					env: ctx.env,
					metadata: { integrationConfigurationId },
				})
			) {
				throw new AuthError("Invalid claims");
			}

			createdCustomer = await customerActions.createWithDefaults({
				ctx,
				customerId: integrationConfigurationId,
				customerData: {
					email: body.account.contact.email,
					name: body.account.contact.name,
					processors: {
						vercel: {
							installation_id: integrationConfigurationId,
							access_token: body.credentials.access_token,
							account_id: claims.account_id,
						},
					},
				},
			});

			// Create test clock for sandbox/development environments
			const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
			let testClockId: string | undefined;
			if (ctx.env === AppEnv.Sandbox) {
				const testClock = await stripeCli.testHelpers.testClocks.create({
					frozen_time: Math.floor(Date.now() / 1000),
				});
				testClockId = testClock.id;
			}

			const stripeCustomer = await createStripeCustomer({
				ctx,
				customer: createdCustomer,
				options: { testClockId },
			});

			// Add vercel-specific metadata
			await stripeCli.customers.update(stripeCustomer.id, {
				metadata: {
					vercel_installation_id: integrationConfigurationId,
				},
			});

			if (stripeCustomer) {
				// Create custom payment method for Vercel marketplace
				const customPaymentMethod = await createCustomStripeCard({
					org: ctx.org,
					env: ctx.env,
					customer: {
						...createdCustomer,
						processor: {
							id: stripeCustomer.id,
							type: ProcessorType.Stripe,
						},
					},
					processor: "vercel",
					processorData: {
						name: body.account.contact.name,
						email: body.account.contact.email,
					},
					defaultPaymentMethod: true,
				});

				await CusService.update({
					db: ctx.db,
					idOrInternalId: createdCustomer.internal_id,
					orgId: ctx.org.id,
					env: ctx.env,
					update: {
						processor: {
							id: stripeCustomer.id,
							type: ProcessorType.Stripe,
						},
						processors: {
							vercel: {
								installation_id: integrationConfigurationId,
								access_token: body.credentials.access_token,
								account_id: claims.account_id,
								custom_payment_method_id: customPaymentMethod?.id,
							},
						},
					},
				});

				logger.info(
					`Successfully created vercel customer, installation ID: ${integrationConfigurationId}`,
					{
						data: {
							customPaymentMethodId: customPaymentMethod?.id,
							customPaymentMethodType: customPaymentMethod?.type,
							customPaymentMethodBillingDetails:
								customPaymentMethod?.billing_details,
						},
					},
				);
			}
		} catch (error) {
			logger.error(`Error creating vercel customer ${error}`, {
				error,
			});
		}

		if (createdCustomer) {
			const fullCreatedCustomer = await CusService.getFull({
				db: ctx.db,
				idOrInternalId: createdCustomer.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});

			const installation = {
				billingPlan:
					fullCreatedCustomer.customer_products[0] !== undefined
						? productToBillingPlan({
								product: cusProductToProduct({
									cusProduct: fullCreatedCustomer.customer_products[0],
								}),
								orgCurrency: ctx.org.default_currency ?? "usd",
							})
						: undefined,
			};

			return c.json(installation, 200);
		}

		return c.body(null, 500);
	},
});
