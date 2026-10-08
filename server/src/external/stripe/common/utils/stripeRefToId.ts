/** The id of a Stripe field that is an id string, or the object when expanded. */
export const stripeRefToId = (
	ref: string | { id: string } | null | undefined,
): string | undefined => (typeof ref === "string" ? ref : ref?.id);
