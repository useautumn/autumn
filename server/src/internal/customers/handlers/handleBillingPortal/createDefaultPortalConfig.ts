import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";

export const createDefaultPortalConfig = async (stripeCli: Stripe) => {
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
