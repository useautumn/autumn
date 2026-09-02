import type {
	AutumnBillingPlan,
	LineItem,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCustomerLicenseQuantityChanges } from "@/internal/billing/v2/compute/computeCustomerLicenseQuantityChanges";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { convergeCustomerLicense } from "@/internal/billing/v2/utils/convergeCustomerLicense";
import { customerLicenseToLineItems } from "@/internal/billing/v2/utils/lineItems/customerLicenseToLineItems";
import { licenseInvoiceCreditFromStoredLineItems } from "@/internal/billing/v2/utils/lineItems/licenseInvoiceCreditFromStoredLineItems";
import { collectSurplusUnusedLicenseAssignments } from "./computeSurplusUnusedLicenseAssignments";
import { computeExpireUnusedLicenseAssignmentUpdates } from "./computeExpireUnusedLicenseAssignmentUpdates";

/**
 * Converges pool paid counts onto the requested totals in place — the parent
 * customer product and seat anchors are untouched. Bills a refund of the full
 * previous quantity picture and a charge of the new one (one line per price,
 * like feature-quantity updates); identical pairs cancel in finalizeLineItems.
 * Surplus unused seats expire so their contributions leave the credit pool.
 */
export const computeUpdateLicenseQuantityPlan = ({
	ctx,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	const { customerProduct, customerLicenseQuantities } =
		updateSubscriptionContext;

	const lineItems: LineItem[] = [];
	const changes = computeCustomerLicenseQuantityChanges({
		customerProduct,
		customerLicenseQuantities,
	});

	for (const { customerLicense, paidQuantity } of changes) {
		lineItems.push(
			...licenseInvoiceCreditFromStoredLineItems({
				ctx,
				billingContext: updateSubscriptionContext,
				customerProduct,
				customerLicense,
			}),
			...customerLicenseToLineItems({
				ctx,
				billingContext: updateSubscriptionContext,
				customerProduct,
				customerLicense: convergeCustomerLicense({
					customerLicense,
					paidQuantity,
				}),
				direction: "charge",
			}),
		);
	}

	const surplusUnusedAssignments = collectSurplusUnusedLicenseAssignments({
		changes,
		unusedLicenseAssignmentsByLinkId:
			updateSubscriptionContext.unusedLicenseAssignmentsByLinkId ?? {},
	});
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: updateSubscriptionContext.fullCustomer,
		outgoingCustomerProducts: surplusUnusedAssignments,
		now: updateSubscriptionContext.currentEpochMs,
	});

	return {
		customerId: updateSubscriptionContext.fullCustomer?.id ?? "",
		insertCustomerProducts: [],
		customPrices: [],
		customEntitlements: [],
		customerLicenseUpdates: changes.map(({ update }) => update),
		updateCustomerProducts: computeExpireUnusedLicenseAssignmentUpdates({
			assignments: surplusUnusedAssignments,
			endedAt: updateSubscriptionContext.currentEpochMs,
		}),
		pooledBalancePlan,
		lineItems,
	};
};
