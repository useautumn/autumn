import { RecaseError } from "../base/RecaseError.js";
import { CheckoutErrorCode } from "../codes/checkoutErrCodes.js";

/**
 * Checkout already completed
 */
export class CheckoutCompletedError extends RecaseError {
	constructor(opts?: { message?: string }) {
		super({
			message: opts?.message || "This checkout has already been completed.",
			code: CheckoutErrorCode.CheckoutCompleted,
			statusCode: 409,
		});
		this.name = "CheckoutCompletedError";
	}
}

/**
 * Checkout expired
 */
export class CheckoutExpiredError extends RecaseError {
	constructor(opts?: { message?: string }) {
		super({
			message:
				opts?.message ||
				"This checkout has expired. Please create a new checkout link.",
			code: CheckoutErrorCode.CheckoutExpired,
			statusCode: 410,
		});
		this.name = "CheckoutExpiredError";
	}
}

/**
 * Checkout unavailable
 */
export class CheckoutUnavailableError extends RecaseError {
	constructor(opts?: { message?: string }) {
		super({
			message:
				opts?.message ||
				"This checkout could not be loaded. Please try again or create a new checkout link.",
			code: CheckoutErrorCode.CheckoutUnavailable,
			statusCode: 404,
		});
		this.name = "CheckoutUnavailableError";
	}
}
