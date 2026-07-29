import {
	type BillingPlan,
	type CreateScheduleBillingContext,
	ErrCode,
	isFreeProduct,
	isProductPaidAndRecurring,
	RecaseError,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleUnsupportedLicenseActionErrors } from "@/internal/billing/v2/common/errors/handleUnsupportedLicenseActionErrors";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import { handleFirstPhaseStartDateErrors } from "./handleFirstPhaseStartDateErrors";

export const handleCreateScheduleErrors = async ({
	db,
	billingContext,
	preview = false,
}: {
	db: DrizzleCli;
	billingContext: CreateScheduleBillingContext;
	preview?: boolean;
}) => {
	handleUnsupportedLicenseActionErrors({
		actionLabel: "billing.create_schedule",
		fullProducts: [
			...billingContext.fullProducts,
			...billingContext.scheduledPhaseContexts.flatMap((phase) =>
				phase.productContexts.map(
					(scheduledProductContext) => scheduledProductContext.fullProduct,
				),
			),
		],
		customerProducts: billingContext.productContexts.map(
			(productContext) => productContext.currentCustomerProduct,
		),
	});

	if (
		billingContext.checkoutMode === "stripe_checkout" &&
		billingContext.enablePlanImmediately &&
		(billingContext.adjustableFeatureQuantities?.length ?? 0) > 0
	) {
		throw new RecaseError({
			message:
				"enable_plan_immediately cannot be used with adjustable feature quantities — set adjustable_quantity to false on each option, or remove enable_plan_immediately.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	handleFirstPhaseStartDateErrors({ billingContext, preview });

	const allImmediateProductsFree = billingContext.fullProducts.every(
		(product) => isFreeProduct({ product }),
	);

	if (allImmediateProductsFree && billingContext.stripeSubscription) {
		const subId = billingContext.stripeSubscription.id;

		const productsOnSub = billingContext.fullCustomer.customer_products.filter(
			(cp) => cp.subscription_ids?.includes(subId),
		);

		const transitioningOutIds = new Set(
			billingContext.productContexts
				.map((ctx) => ctx.currentCustomerProduct?.id)
				.filter(Boolean),
		);

		const subscriptionWillBeCanceled =
			productsOnSub.length > 0 &&
			productsOnSub.every((cp) => transitioningOutIds.has(cp.id));
		const hasFuturePaidRecurringPhase =
			billingContext.scheduledPhaseContexts.some((phase) =>
				phase.productContexts.some((ctx) =>
					isProductPaidAndRecurring(ctx.fullProduct),
				),
			);

		if (subscriptionWillBeCanceled && !hasFuturePaidRecurringPhase) {
			throw new RecaseError({
				message:
					"Cannot create a schedule with a free first phase while the customer has an active subscription. Please cancel the existing subscription first.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};

export const handleCreateScheduleBillingPlanErrors = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
}) => {
	handleStripeBillingPlanErrors({ ctx, billingContext, billingPlan });
};
