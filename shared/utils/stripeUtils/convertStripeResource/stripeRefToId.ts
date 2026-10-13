type StripeRef = string | { id?: string };

/** The id of a Stripe field that is an id string, or the object when expanded. */
export function stripeRefToId(ref: string | { id: string }): string;
export function stripeRefToId(
	ref: StripeRef | null | undefined,
): string | undefined;
export function stripeRefToId(ref: StripeRef | null | undefined) {
	return typeof ref === "string" ? ref : ref?.id;
}
