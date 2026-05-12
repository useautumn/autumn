export const PREVIEW_STRIPE_PRICE_ID_PREFIX = "price_PREVIEW_";
export const PREVIEW_STRIPE_PRODUCT_ID_PREFIX = "prod_PREVIEW_";

export const isPreviewStripeId = ({ stripeId }: { stripeId?: string | null }) =>
	stripeId?.startsWith(PREVIEW_STRIPE_PRICE_ID_PREFIX) === true ||
	stripeId?.startsWith(PREVIEW_STRIPE_PRODUCT_ID_PREFIX) === true;
