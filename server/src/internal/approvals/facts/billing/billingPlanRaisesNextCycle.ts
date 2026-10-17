import type {
	BillingContext,
	BillingPlan,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToNextCyclePreview } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/billingPlanToNextCyclePreview";

const nextCycleTotal = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) =>
	billingPlanToNextCyclePreview({ ctx, billingContext, billingPlan }).nextCycle
		?.total ?? 0;

/**
 * Whether the next cycle bills more than it would without this change. The
 * unchanged side keeps today's discounts, and both are pre-tax.
 */
export const billingPlanRaisesNextCycle = ({
	ctx,
	billingContext,
	billingPlan,
	currentDiscounts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	currentDiscounts: StripeDiscountWithCoupon[];
}): boolean => {
	const unchangedPlan: BillingPlan = {
		autumn: {
			customerId: billingPlan.autumn.customerId,
			insertCustomerProducts: [],
		},
		stripe: {},
	};
	return (
		nextCycleTotal({ ctx, billingContext, billingPlan }) >
		nextCycleTotal({
			ctx,
			billingContext: { ...billingContext, stripeDiscounts: currentDiscounts },
			billingPlan: unchangedPlan,
		})
	);
};
