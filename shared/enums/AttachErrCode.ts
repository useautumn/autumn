export enum AttachErrCode {
	// InvalidOptions = "invalid_options",
	ProductAlreadyAttached = "product_already_attached",
}

export const PAST_START_REQUIRES_INVOICE =
	"Past starts_at cannot be used when Stripe Checkout is required.";
