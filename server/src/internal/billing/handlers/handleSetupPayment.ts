import {
	AffectedResource,
	ErrCode,
	SetupPaymentParamsSchema,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { toSuccessUrl } from "@/internal/orgs/orgUtils/convertOrgUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { getOrCreateCustomer } from "../../customers/cusUtils/getOrCreateCustomer.js";

export const handleSetupPayment = createRoute({
	body: SetupPaymentParamsSchema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, env, org, logger } = ctx;

		const { customer_id, customer_data, success_url, checkout_session_params } =
			c.req.valid("json");

		const customer = await getOrCreateCustomer({
			ctx,
			customerId: customer_id,
			customerData: customer_data,
		});

		await getOrCreateStripeCustomer({
			ctx,
			customer,
		});

		const stripeCli = createStripeCli({ org, env });

		// check if user already specified payment methods in their request
		const hasUserSpecifiedPaymentMethods =
			checkout_session_params?.payment_method_types;

		const sessionParams = {
			customer: customer.processor?.id,
			mode: "setup" as const,
			success_url: success_url || toSuccessUrl({ org, env }),
			currency: org.default_currency || "usd",
			...(checkout_session_params as any),
		};

		try {
			// let stripe automatically determine payment methods
			const session = await stripeCli.checkout.sessions.create(sessionParams);
			return c.json({
				customer_id: customer.id,
				url: session.url,
			});
		} catch (error: any) {
			// payment method errors
			if (
				error.message &&
				(error.message.includes("payment method") ||
					error.message.includes("No valid payment"))
			) {
				logger.warn("Stripe checkout session creation failed", {
					customerId: customer.id,
					error: error.message,
				});

				if (hasUserSpecifiedPaymentMethods) {
					throw error;
				}

				try {
					// card payment method fallback
					const fallbackSession = await stripeCli.checkout.sessions.create({
						...sessionParams,
						payment_method_types: ["card"],
					});

					logger.info("Created checkout session with card payment method", {
						customerId: customer.id,
					});

					return c.json({
						customer_id: customer.id,
						url: fallbackSession.url,
					});
				} catch (fallbackError: any) {
					// if fallback failed
					logger.error(
						"Failed to create checkout session even with card payment method",
						{
							customerId: customer.id,
							error: fallbackError.message,
						},
					);

					throw new RecaseError({
						code: ErrCode.InvalidRequest,
						message:
							"Unable to create checkout session. Please ensure you have activated card payment method in your Stripe dashboard.",
						statusCode: 400,
					});
				}
			}

			// Re-throw errors
			throw error;
		}
	},
});
