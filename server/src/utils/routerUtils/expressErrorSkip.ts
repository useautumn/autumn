import { ErrCode } from "@autumn/shared";
import Stripe from "stripe";
import RecaseError from "../errorUtils.js";

type ExpressRequest = {
	originalUrl: string;
	logger: {
		warn: (message: string) => void;
	};
	org?: {
		slug?: string;
	};
	orgId?: string;
	body?: any;
};

type ExpressResponse = {
	status: (code: number) => {
		json: (data: any) => any;
	};
};

/**
 * Checks if an error should be handled as a warning instead of an error.
 * Returns response object if handled, null otherwise.
 */
export const handleExpressErrorSkip = ({
	error,
	req,
	res,
}: {
	error: any;
	req: ExpressRequest;
	res: ExpressResponse;
}) => {
	const originalUrl = req.originalUrl;

	// Handle RecaseError with EntityNotFound code
	if (error instanceof RecaseError) {
		if (error.code === ErrCode.EntityNotFound) {
			req.logger.warn(`${error.message}, org: ${req.org?.slug || req.orgId}`);
			return res.status(404).json({
				message: error.message,
				code: error.code,
			});
		}
	}

	// Handle Stripe errors
	if (error instanceof Stripe.errors.StripeError) {
		// Exchange router invalid API key
		if (
			originalUrl.includes("/exchange") &&
			error.message.includes("Invalid API Key provided")
		) {
			req.logger.warn("Exchange router, invalid API Key provided");
			return res.status(400).json({
				message: error.message,
				code: ErrCode.InvalidRequest,
			});
		}

		// Invalid email address
		if (
			error.message.includes("not a valid email address") ||
			error.message.includes("email: Invalid input")
		) {
			req.logger.warn("Invalid email address");
			return res.status(400).json({
				message: error.message,
				code: ErrCode.InvalidRequest,
			});
		}

		// Billing portal config error
		if (
			originalUrl.includes("/billing_portal") &&
			error.message.includes("Provide a configuration or create your default")
		) {
			req.logger.warn(`Billing portal config error, org: ${req.org?.slug}`);
			return res.status(404).json({
				message: error.message,
				code: ErrCode.InvalidRequest,
			});
		}

		// Billing portal return_url error
		if (
			originalUrl.includes("/billing_portal") &&
			error.message.includes("Invalid URL: An explicit scheme (such as https)")
		) {
			req.logger.warn(
				`Billing portal return_url error, org: ${req.org?.slug}, return_url: ${req.body?.return_url}`,
			);
			return res.status(400).json({
				message: error.message,
				code: ErrCode.InvalidRequest,
			});
		}

		// Card declined error
		if (error.message.includes("Your card was declined.")) {
			req.logger.warn(`Card declined error, org: ${req.org?.slug}`);
			return res.status(400).json({
				message: error.message,
				code: ErrCode.InvalidRequest,
			});
		}

		// Cannot delete org with production customers
		if (
			error.message.includes("Cannot delete org with production mode customers")
		) {
			req.logger.warn(
				`Cannot delete org with production customers, org: ${req.org?.slug}`,
			);
			return res.status(400).json({
				message: error.message,
				code: ErrCode.InvalidRequest,
			});
		}

		// Webhook endpoint limit reached
		if (
			error.message.includes(
				"You have reached the maximum of 16 test webhook endpoints",
			)
		) {
			req.logger.warn(`Webhook endpoint limit reached, org: ${req.org?.slug}`);
			return res.status(400).json({
				message: error.message,
				code: ErrCode.InvalidRequest,
			});
		}

		// Generic invalid URL scheme error
		if (
			error.message.includes(
				"Invalid URL: An explicit scheme (such as https) must be provided",
			)
		) {
			req.logger.warn(`Invalid URL scheme error, org: ${req.org?.slug}`);
			return res.status(400).json({
				message: error.message,
				code: ErrCode.InvalidRequest,
			});
		}

		// Not a valid URL error
		if (error.message.includes("Not a valid URL")) {
			req.logger.warn(`Not a valid URL error, org: ${req.org?.slug}`);
			return res.status(400).json({
				message: error.message,
				code: ErrCode.InvalidRequest,
			});
		}
	}

	// No skip case matched
	return null;
};
