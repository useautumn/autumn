import {
	AppEnv,
	type Customer,
	cusProductToProduct,
	ProcessorType,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createCustomStripeCard } from "@/external/stripe/stripeCardUtils.js";
import { createStripeCustomer } from "@/external/stripe/stripeCusUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { handleCreateCustomer } from "@/internal/customers/handlers/handleCreateCustomer.js";
import {
	AuthError,
	getAuthorizationToken,
	verifyClaims,
	verifyToken,
} from "../../misc/vercelAuth.js";
import type {
	VercelBillingPlan,
	VercelUpsertInstallation,
} from "../../misc/vercelTypes.js";
import { productToBillingPlan } from "../handleListBillingPlans.js";

export const handleUpsertInstallation = createRoute({
	handler: async (c) => {
		console.log("Vercel Webhook Router: PUT /installations");
		console.log("Vercel Webhook Router: req.params", c.req.param());

		const body = await c.req.json<VercelUpsertInstallation>();
		console.log("Vercel Webhook Router: req.body", body);

		const ctx = c.get("ctx");
		console.log("Vercel Webhook Router: ctx.org", ctx.org);
		console.log("Vercel Webhook Router: ctx.env", ctx.env);
		console.log("Vercel Webhook Router: ctx.features", ctx.features);

		const { integrationConfigurationId } = c.req.param();
		let createdCustomer: Customer | null = null;

		try {
			// Create a compatible request object for handleCreateCustomer
			const req = {
				...ctx,
				logtail: ctx.logger,
				orgId: ctx.org.id,
			};

			const token = getAuthorizationToken(
				c.req.header("Authorization") as string,
			);
			const claims = await verifyToken({ token, org: ctx.org, env: ctx.env });
			console.log("Vercel Webhook Router: claims", claims);

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

			createdCustomer = await handleCreateCustomer({
				req: req as any,
				cusData: {
					id: integrationConfigurationId,
					email: body.account.contact.email,
					name: body.account.contact.name,
				},
			});

			if (createdCustomer) {
				// Create test clock for sandbox/development environments
				let testClockId: string | undefined;
				if (ctx.env === AppEnv.Sandbox) {
					const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
					const testClock = await stripeCli.testHelpers.testClocks.create({
						frozen_time: Math.floor(Date.now() / 1000),
					});
					testClockId = testClock.id;

					ctx.logger.info(
						"Created test clock for sandbox Vercel installation",
						{
							testClockId: testClock.id,
						},
					);
				}

				const stripeCustomer = await createStripeCustomer({
					org: ctx.org,
					env: ctx.env,
					customer: createdCustomer,
					testClockId,
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

					if (customPaymentMethod) {
						ctx.logger.info("✅ Created custom payment method for Vercel", {
							paymentMethodId: customPaymentMethod.id,
							customerId: stripeCustomer.id,
						});
					} else {
						ctx.logger.warn(
							"⚠️ No custom payment method created - check org config",
						);
					}
				}
			}
		} catch (_) {
			console.log(
				"ERROR: Error creating customer: --------------------------------",
			);
			console.log(_);
			console.log(ctx.org);
			console.log("--------------------------------");
		}

		if (createdCustomer) {
			const fullCreatedCustomer = await CusService.getFull({
				db: ctx.db,
				idOrInternalId: createdCustomer.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			return c.json(
				{
					billingPlan:
						fullCreatedCustomer.customer_products[0] !== undefined
							? (productToBillingPlan({
									product: cusProductToProduct({
										cusProduct: fullCreatedCustomer.customer_products[0],
									}),
									orgCurrency: ctx.org.default_currency ?? "usd",
								}) as unknown as VercelBillingPlan)
							: null,
				},
				200,
			);
		}

		return c.body(null, 500);
	},
});
