import type {
	AttachBillingContext,
	AutumnBillingPlan,
	MultiAttachBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { computeAttachNewCustomerProduct } from "../../attach/compute/computeAttachNewCustomerProduct";

/**
 * Computes the billing plan for attaching multiple products.
 *
 * For each product, creates a temporary AttachBillingContext with no transitions
 * (currentCustomerProduct: undefined, planTiming: "immediate") and reuses
 * computeAttachNewCustomerProduct to build the new customer product.
 */
export const computeMultiAttachPlan = ({
	ctx,
	multiAttachBillingContext,
}: {
	ctx: AutumnContext;
	multiAttachBillingContext: MultiAttachBillingContext;
}): AutumnBillingPlan => {
	const { productContexts, trialContext } = multiAttachBillingContext;

	// Build a new customer product for each plan
	const newCustomerProducts = productContexts.map((productContext) => {
		// Construct a temporary AttachBillingContext per product
		const perProductContext: AttachBillingContext = {
			...multiAttachBillingContext,
			attachProduct: productContext.fullProduct,
			fullProducts: [productContext.fullProduct],
			featureQuantities: productContext.featureQuantities,
			customPrices: productContext.customPrices,
			customEnts: productContext.customEnts,

			// No transitions for multi-attach
			currentCustomerProduct: undefined,
			scheduledCustomerProduct: undefined,
			planTiming: "immediate",
			endOfCycleMs: undefined,
		};

		return computeAttachNewCustomerProduct({
			ctx,
			attachBillingContext: perProductContext,
		});
	});

	// Build line items for all new products (no deleted product, immediate timing)
	const { allLineItems: lineItems, updateCustomerEntitlements } =
		buildAutumnLineItems({
			ctx,
			newCustomerProducts,
			deletedCustomerProduct: undefined,
			billingContext: multiAttachBillingContext,
			includeArrearLineItems: false,
		});

	// Merge custom prices and entitlements from all product contexts
	const allCustomPrices = productContexts.flatMap((pc) => pc.customPrices);
	const allCustomEnts = productContexts.flatMap((pc) => pc.customEnts);

	const plan: AutumnBillingPlan = {
		insertCustomerProducts: newCustomerProducts,
		updateCustomerProduct: undefined,
		deleteCustomerProduct: undefined,
		customPrices: allCustomPrices,
		customEntitlements: allCustomEnts,
		customFreeTrial: trialContext?.customFreeTrial,
		lineItems,
		updateCustomerEntitlements,
	};

	// Finalize line items (trial filtering, unchanged price filtering, discounts)
	plan.lineItems = finalizeLineItems({
		ctx,
		lineItems: plan.lineItems ?? [],
		billingContext: multiAttachBillingContext,
		autumnBillingPlan: plan,
	});

	return plan;
};
