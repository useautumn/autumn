import type {
	AttachParamsV0,
	FullCustomer,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveParamDiscounts } from "@/internal/billing/v2/providers/stripe/utils/discounts/resolveParamDiscounts";

/** Resolves param discounts and merges with existing Stripe subscription discounts. */
export const setupAttachDiscounts = async ({
	ctx,
	params,
	fullCustomer,
	stripeDiscounts,
}: {
	ctx: AutumnContext;
	params: AttachParamsV0;
	fullCustomer: FullCustomer;
	stripeDiscounts?: StripeDiscountWithCoupon[];
}): Promise<StripeDiscountWithCoupon[] | undefined> => {
	if (!params.discounts?.length) {
		return stripeDiscounts;
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: fullCustomer.env });
	const paramDiscounts = await resolveParamDiscounts({
		stripeCli,
		discounts: params.discounts,
	});

	// Merge with existing discounts, deduplicating by coupon ID
	const existingCouponIds = new Set(
		(stripeDiscounts ?? []).map((d) => d.source.coupon.id),
	);
	const newDiscounts = paramDiscounts.filter(
		(d) => !existingCouponIds.has(d.source.coupon.id),
	);

	return [...(stripeDiscounts ?? []), ...newDiscounts];
};
