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
 * Builds the line items invoiced immediately for an attach.
 *
 * - "none": nothing charged now (pure scheduled attach).
 * - "one-off-only": only the new product's one-time fees (e.g. onboarding
 *   fees) are charged now; the old product's refund/arrear and the recurring
 *   proration are deferred to the schedule.
 * - "all": full immediate charge (normal immediate attach/upgrade).
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
	const mode = shouldBuildImmediateLineItems({
		planTiming: attachBillingContext.planTiming,
		customerProductStatus: newCustomerProduct.status,
		accessStartsAt: attachBillingContext.accessStartsAt,
	});

	if (mode === "none") {
		return { allLineItems: [], updateCustomerEntitlements: [] };
	}

	const isOneOffOnly = mode === "one-off-only";

	return buildAutumnLineItems({
		ctx,
		newCustomerProducts: [newCustomerProduct],
		deletedCustomerProduct: isOneOffOnly ? undefined : currentCustomerProduct,
		billingContext: attachBillingContext,
		includeArrearLineItems: isOneOffOnly
			? false
			: !params.carry_over_usages?.enabled,
		newProductPriceFilters: isOneOffOnly
			? { includeOnlyOneOffPrices: true }
			: undefined,
	});
};
