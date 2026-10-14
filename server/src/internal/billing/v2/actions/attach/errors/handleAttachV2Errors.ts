import type {
	AttachBillingContext,
	AttachParamsV1,
	BillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleAttachInvoiceModeErrors } from "@/internal/billing/v2/actions/attach/errors/handleAttachInvoiceModeErrors";
import { handleBillingCycleAnchorErrors } from "@/internal/billing/v2/actions/attach/errors/handleBillingCycleAnchorErrors";
import { handleCarryOverBalancesErrors } from "@/internal/billing/v2/actions/attach/errors/handleCarryOverBalancesErrors";
import { handleCurrentCustomerProductErrors } from "@/internal/billing/v2/actions/attach/errors/handleCurrentCustomerProductErrors";
import { handleEndDateErrors } from "@/internal/billing/v2/actions/attach/errors/handleEndDateErrors";
import { handleNewBillingSubscriptionErrors } from "@/internal/billing/v2/actions/attach/errors/handleNewBillingSubscriptionErrors";
import { handleScheduledSwitchOneOffErrors } from "@/internal/billing/v2/actions/attach/errors/handleScheduledSwitchOneOffErrors";
import { handleStartDateErrors } from "@/internal/billing/v2/actions/attach/errors/handleStartDateErrors";
import { handleStripeCheckoutErrors } from "@/internal/billing/v2/actions/attach/errors/handleStripeCheckoutErrors";
import { handleTransitionConfigErrors } from "@/internal/billing/v2/actions/attach/errors/handleTransitionConfigErrors";
import { handleProrationBehaviorErrors } from "@/internal/billing/v2/common/errors/handleBillingBehaviorErrors";
import { handleCarryOverUsagesErrors } from "@/internal/billing/v2/common/errors/handleCarryOverUsagesErrors";
import { handleCustomLineItemsErrors } from "@/internal/billing/v2/common/errors/handleCustomLineItemsErrors";
import { handleEntityLicenseAssignmentErrors } from "@/internal/billing/v2/common/errors/handleEntityLicenseAssignmentErrors";
import { handleExternalPSPErrors } from "@/internal/billing/v2/common/errors/handleExternalPSPErrors";
import { handleLicenseAttachTargetErrors } from "@/internal/billing/v2/common/errors/handleLicenseAttachTargetErrors";
import { handleRemoveDiscountsErrors } from "@/internal/billing/v2/common/errors/handleRemoveDiscountsErrors";
import { handleRevertTrialErrors } from "@/internal/billing/v2/common/errors/handleRevertTrialErrors";
import { handleSubscriptionIdErrors } from "@/internal/billing/v2/common/errors/handleSubscriptionIdErrors";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import { handleCustomPaymentMethodErrorsV2 } from "@/internal/customers/attach/attachUtils/handleAttachErrors";
import { handleTaxLocationErrors } from "./handleTaxLocationErrors";

export const handleAttachV2Errors = async ({
	ctx,
	billingContext,
	billingPlan,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	billingPlan: BillingPlan;
	params: AttachParamsV1;
	preview?: boolean;
}) => {
	const { autumn: autumnBillingPlan } = billingPlan;

	if (!billingContext.skipExternalPSPGuard) {
		handleExternalPSPErrors({
			customerProducts: billingContext.fullCustomer.customer_products,
			attachProduct: billingContext.attachProduct,
			action: "attach",
		});
	}

	handleCustomPaymentMethodErrorsV2({ billingContext });

	handleEntityLicenseAssignmentErrors({
		fullCustomer: billingContext.fullCustomer,
	});

	handleLicenseAttachTargetErrors({
		fullCustomer: billingContext.fullCustomer,
		attachProduct: billingContext.attachProduct,
	});

	handleCurrentCustomerProductErrors({ billingContext });

	handleNewBillingSubscriptionErrors({ billingContext, params });

	handleStripeCheckoutErrors({ billingContext, autumnBillingPlan });

	handleAttachInvoiceModeErrors({ ctx, billingContext, params });
	if (!preview) handleTaxLocationErrors({ ctx, billingContext, billingPlan });

	handleScheduledSwitchOneOffErrors({ ctx, billingContext });
	handleBillingCycleAnchorErrors({ billingContext, params });
	handleStartDateErrors({ billingContext, params, preview });
	handleEndDateErrors({ billingContext, params });

	handleTransitionConfigErrors({ ctx, billingContext });

	handleCarryOverBalancesErrors({ ctx, params, billingContext });

	handleCarryOverUsagesErrors({
		ctx,
		carryOverUsages: params.carry_over_usages,
		replacesPlanNow: billingContext.planTiming === "immediate",
	});

	handleProrationBehaviorErrors({
		billingContext,
		billingPlan,
	});

	await handleSubscriptionIdErrors({
		db: ctx.db,
		internalCustomerId: billingContext.fullCustomer.internal_id,
		subscriptionIds: [billingContext.externalId],
	});

	handleCustomLineItemsErrors({
		params,
		billingContext,
		billingPlan,
	});

	handleRevertTrialErrors({ billingContext });

	handleRemoveDiscountsErrors({ params });

	handleStripeBillingPlanErrors({ ctx, billingContext, billingPlan });
};
