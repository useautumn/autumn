import {
	ErrCode,
	type FullProduct,
	type Price,
	type Product,
	RecaseError,
} from "@autumn/shared";
import { resolveStripeProductIdForPrice } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

const stripeProductIdsOfPrices = ({
	prices,
}: {
	prices: (Price & { product?: Product | null })[];
}) =>
	new Set(
		prices
			.map((price) => resolveStripeProductIdForPrice({ price }))
			.filter((id): id is string => id !== null),
	);

const planSharesStripeProductId = ({
	plan,
	stripeProductIds,
}: {
	plan: FullProduct;
	stripeProductIds: Set<string>;
}) =>
	plan.prices.some((price) => {
		const stripeProductId = resolveStripeProductIdForPrice({
			price: { ...price, product: plan },
		});
		return stripeProductId !== null && stripeProductIds.has(stripeProductId);
	});

/** Stripe scopes coupons to products, so a partial group would silently discount the rest. */
export const validateCouponStripeProductScope = async ({
	ctx,
	prices,
}: {
	ctx: AutumnContext;
	prices: (Price & { product?: Product | null })[];
}) => {
	const stripeProductIds = stripeProductIdsOfPrices({ prices });
	if (stripeProductIds.size === 0) return;

	const selectedInternalIds = new Set(
		prices.map((price) => price.internal_product_id).filter(Boolean),
	);
	// Versions of one plan share a Stripe product, so a coupon on any version
	// already covers the others.
	const selectedPlanIds = new Set(
		prices.map((price) => price.product?.id).filter(Boolean),
	);

	// A plan split moments earlier must not read back stale.
	const plans = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		skipCache: true,
	});

	const missingPlanIds = [
		...new Set(
			plans
				.filter(
					(plan) =>
						!selectedInternalIds.has(plan.internal_id) &&
						!selectedPlanIds.has(plan.id) &&
						!plan.archived &&
						planSharesStripeProductId({ plan, stripeProductIds }),
				)
				.map((plan) => plan.id),
		),
	];

	if (missingPlanIds.length === 0) return;

	throw new RecaseError({
		message: `Stripe applies a coupon to a whole product, so also include: ${missingPlanIds.join(", ")}`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
