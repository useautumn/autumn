import type {
	AttachBillingContext,
	AttachParamsV1,
	FullCusProduct,
	LineItem,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { shouldBuildImmediateLineItems } from "./shouldBuildImmediateLineItems";

/**
 * Builds the line items invoiced immediately for an attach. Returns no items
 * when access starts in the future (the recurring charges and any one-off fees
 * are billed when the plan activates via its Stripe schedule).
 */
export const computeAttachLineItems = ({
	ctx,
	attachBillingContext,
	params,
	newCustomerProduct,
	currentCustomerProduct,
}: {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
	params: AttachParamsV1;
	newCustomerProduct: FullCusProduct;
	currentCustomerProduct?: FullCusProduct;
}): {
	allLineItems: LineItem[];
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
} => {
	const shouldBuild = shouldBuildImmediateLineItems({
		planTiming: attachBillingContext.planTiming,
		customerProductStatus: newCustomerProduct.status,
		accessStartsAt: attachBillingContext.accessStartsAt,
	});

	if (!shouldBuild) {
		return { allLineItems: [], updateCustomerEntitlements: [] };
	}

	return buildAutumnLineItems({
		ctx,
		newCustomerProducts: [newCustomerProduct],
		deletedCustomerProduct: currentCustomerProduct,
		billingContext: attachBillingContext,
		includeArrearLineItems: !params.carry_over_usages?.enabled,
	});
};
