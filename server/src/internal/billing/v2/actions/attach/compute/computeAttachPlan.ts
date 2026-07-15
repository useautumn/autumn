import type {
	AttachBillingContext,
	AttachParamsV1,
	AutumnBillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions";
import { cusProductToExistingBalanceCarryOvers } from "@/internal/billing/v2/utils/handleCarryOvers/cusProductToExistingBalanceCarryOvers";
import { cusProductToOneOffPrepaidCarryOvers } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers";
import { computeAttachNewCustomerProduct } from "./computeAttachNewCustomerProduct";
import { computeAttachTransitionUpdates } from "./computeAttachTransitionUpdates";
import { finalizeAttachPlan } from "./finalizeAttachPlan";
import { shouldBuildImmediateLineItems } from "./shouldBuildImmediateLineItems";

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
	params,
}: {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
	params: AttachParamsV1;
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
		params,
	});

	const updateCustomerProduct = computeAttachTransitionUpdates({
		attachBillingContext,
		params,
	});

	// Customer licenses follow the incoming definitions on immediate swaps;
	// scheduled swaps transition at activation instead.
	const customerLicenseTransitions =
		planTiming === "immediate" && currentCustomerProduct
			? computeCustomerLicenseTransitions({
					outgoingCustomerProducts: [currentCustomerProduct],
					incomingCustomerProducts: [newCustomerProduct],
					customerLicenseBillingContext:
						attachBillingContext.customerLicenseBillingContext,
				})
			: [];

	const {
		entitlements: carriedOverEntitlements,
		customerEntitlements: carriedOverCustomerEntitlements,
	} = cusProductToExistingBalanceCarryOvers({
		attachBillingContext,
		params,
	});

	// Auto-preserve one-off prepaid balances on immediate transitions so the
	// credits the customer already paid for don't vanish when the cusProduct
	// expires. Skipped on scheduled transitions — the outgoing product remains
	// active until end-of-cycle and the preservation runs at activation time.
	const oneOffPrepaidCarryOvers =
		planTiming === "immediate" && currentCustomerProduct
			? cusProductToOneOffPrepaidCarryOvers({
					currentCustomerProduct,
					fullCustomer: attachBillingContext.fullCustomer,
				})
			: { entitlements: [], customerEntitlements: [] };

	const includeArrearLineItems = !params.carry_over_usages?.enabled;
	const shouldBuildLineItems = shouldBuildImmediateLineItems({
		planTiming,
		customerProductStatus: newCustomerProduct.status,
		accessStartsAt: attachBillingContext.accessStartsAt,
	});

	const { allLineItems: lineItems, updateCustomerEntitlements } =
		shouldBuildLineItems
			? buildAutumnLineItems({
					ctx,
					newCustomerProducts: [newCustomerProduct],
					deletedCustomerProduct: currentCustomerProduct,
					billingContext: attachBillingContext,
					includeArrearLineItems,
				})
			: { allLineItems: [], updateCustomerEntitlements: [] };

	let plan: AutumnBillingPlan = {
		customerId: attachBillingContext.fullCustomer?.id ?? "",
		insertCustomerProducts: [newCustomerProduct],
		updateCustomerProduct,
		deleteCustomerProduct: scheduledCustomerProduct,
		customPrices,
		customEntitlements: [
			...(customEnts ?? []),
			...(carriedOverEntitlements ?? []),
			...oneOffPrepaidCarryOvers.entitlements,
		],
		customFreeTrial: trialContext?.customFreeTrial,
		insertPlanLicenses: attachBillingContext.insertPlanLicenses,
		customerLicenseTransitions,
		lineItems,
		insertCustomerEntitlements: [
			...(carriedOverCustomerEntitlements ?? []),
			...oneOffPrepaidCarryOvers.customerEntitlements,
		],
		updateCustomerEntitlements,
	};

	plan = finalizeAttachPlan({
		ctx,
		plan,
		attachBillingContext,
		params,
	});

	return plan;
};
