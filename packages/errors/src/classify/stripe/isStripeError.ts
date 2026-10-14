export type StripeLikeError = Error & {
	type: string;
	statusCode?: number;
	code?: string;
	param?: string;
};

export const isStripeError = (error: unknown): error is StripeLikeError =>
	error instanceof Error &&
	"type" in error &&
	typeof error.type === "string" &&
	error.type.startsWith("Stripe");
