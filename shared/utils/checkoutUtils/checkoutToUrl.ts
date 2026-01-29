// Checkout URL base - defaults to localhost for dev
const AUTUMN_CHECKOUT_BASE_URL =
	process.env.AUTUMN_CHECKOUT_BASE_URL || "http://localhost:3001";

export const checkoutToUrl = ({ checkoutId }: { checkoutId: string }): string =>
	`${AUTUMN_CHECKOUT_BASE_URL}/c/${checkoutId}`;
