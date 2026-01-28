import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import type {
	AttachBillingContext,
	AutumnBillingPlan,
} from "@/internal/billing/v2/types";
import { computeAttachNewCustomerProduct } from "./computeAttachNewCustomerProduct";
import { computeAttachTransitionUpdates } from "./computeAttachTransitionUpdates";
import { finalizeAttachPlan } from "./finalizeAttachPlan";

/**
 * Computes the billing plan for attaching a product.
 *
 * Scenarios:
 * - Add-on/One-time (no currentCustomerProduct): Just insert new product
 * - First main product (no currentCustomerProduct): Just insert new product
 * - Upgrade (currentCustomerProduct exists, planTiming=immediate): Expire current, insert new active
 * - Downgrade (currentCustomerProduct exists, planTiming=end_of_cycle): Cancel current at end of cycle, insert new scheduled
 */
export const computeAttachPlan = ({
	ctx,
	attachBillingContext,
}: {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
}): AutumnBillingPlan => {
	const {
		currentCustomerProduct,
		scheduledCustomerProduct,
		planTiming,
		customPrices,
		customEnts,
		trialContext,
	} = attachBillingContext;

	const newCustomerProduct = computeAttachNewCustomerProduct({
		ctx,
		attachBillingContext,
	});

	const updateCustomerProduct = computeAttachTransitionUpdates({
		attachBillingContext,
	});

	const lineItems =
		planTiming === "immediate"
			? buildAutumnLineItems({
					ctx,
					newCustomerProducts: [newCustomerProduct],
					deletedCustomerProduct: currentCustomerProduct,
					billingContext: attachBillingContext,
				})
			: [];

	let plan: AutumnBillingPlan = {
		insertCustomerProducts: [newCustomerProduct],
		updateCustomerProduct,
		deleteCustomerProduct: scheduledCustomerProduct,
		customPrices,
		customEntitlements: customEnts,
		customFreeTrial: trialContext?.customFreeTrial,
		lineItems,
		updateCustomerEntitlements: undefined,
	};

	plan = finalizeAttachPlan({
		ctx,
		plan,
		attachBillingContext,
	});

	return plan;
};
