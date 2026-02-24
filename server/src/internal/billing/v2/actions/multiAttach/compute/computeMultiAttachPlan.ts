import type {
	AttachBillingContext,
	AutumnBillingPlan,
	MultiAttachBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { computeAttachNewCustomerProduct } from "../../attach/compute/computeAttachNewCustomerProduct";
import { computeAttachTransitionUpdates } from "../../attach/compute/computeAttachTransitionUpdates";

/**
 * Computes the billing plan for attaching multiple products.
 *
 * For each product, creates a temporary AttachBillingContext and reuses
 * computeAttachNewCustomerProduct to build the new customer product.
 * At most one product may trigger a transition (validated by error handler).
 */
export const computeMultiAttachPlan = ({
	ctx,
	multiAttachBillingContext,
}: {
	ctx: AutumnContext;
	multiAttachBillingContext: MultiAttachBillingContext;
}): AutumnBillingPlan => {
	const { productContexts, trialContext } = multiAttachBillingContext;

	// Find the single transitioning product context (at most one, validated by error handler)
	const transitioningCtx = productContexts.find(
		(pc) => pc.currentCustomerProduct !== undefined,
	);
	const deletedCustomerProduct = transitioningCtx?.currentCustomerProduct;
	const scheduledCustomerProduct = transitioningCtx?.scheduledCustomerProduct;

	// Build a new customer product for each plan
	let transitionUpdateCtx: AttachBillingContext | undefined;
	const newCustomerProducts = productContexts.map((productContext) => {
		// Construct a temporary AttachBillingContext per product
		const perProductContext: AttachBillingContext = {
			...multiAttachBillingContext,
			attachProduct: productContext.fullProduct,
			fullProducts: [productContext.fullProduct],
			featureQuantities: productContext.featureQuantities,
			customPrices: productContext.customPrices,
			customEnts: productContext.customEnts,

			// Use per-product transition context (at most one will have a currentCustomerProduct)
			currentCustomerProduct: productContext.currentCustomerProduct,
			scheduledCustomerProduct: productContext.scheduledCustomerProduct,
			planTiming: "immediate",
			endOfCycleMs: undefined,
		};

		// Track the transitioning product's context for computing updates
		if (productContext.currentCustomerProduct) {
			transitionUpdateCtx = perProductContext;
		}

		return computeAttachNewCustomerProduct({
			ctx,
			attachBillingContext: perProductContext,
		});
	});

	// Compute transition updates (expire the current product) if there's a transition
	const updateCustomerProduct = transitionUpdateCtx
		? computeAttachTransitionUpdates({
				attachBillingContext: transitionUpdateCtx,
			})
		: undefined;

	// Build line items for all new products
	// If there's a transition, pass the deleted product for proration/refund line items
	const { allLineItems: lineItems, updateCustomerEntitlements } =
		buildAutumnLineItems({
			ctx,
			newCustomerProducts,
			deletedCustomerProduct,
			billingContext: multiAttachBillingContext,
			includeArrearLineItems: deletedCustomerProduct !== undefined,
		});

	// Merge custom prices and entitlements from all product contexts
	const allCustomPrices = productContexts.flatMap((pc) => pc.customPrices);
	const allCustomEnts = productContexts.flatMap((pc) => pc.customEnts);

	const plan: AutumnBillingPlan = {
		insertCustomerProducts: newCustomerProducts,
		updateCustomerProduct,
		deleteCustomerProduct: scheduledCustomerProduct,
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
