/** Duck-typed so the package needn't depend on the stripe SDK: every Stripe error's `type` starts with "Stripe". */
export type StripeLikeError = Error & { type: string; statusCode?: number };

export const isStripeError = (error: unknown): error is StripeLikeError =>
	error instanceof Error &&
	"type" in error &&
	typeof error.type === "string" &&
	error.type.startsWith("Stripe");
