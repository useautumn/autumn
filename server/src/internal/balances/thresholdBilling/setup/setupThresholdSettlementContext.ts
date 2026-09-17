import { BillingVersion, cusProductToProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBillableFullCustomer } from "@/internal/balances/getBillableFullCustomer.js";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeCustomerForBilling.js";
import { resolveThresholdSettlement } from "../resolve/resolveThresholdSettlement.js";
import type { ThresholdSettlementContext } from "../thresholdSettlementContext.js";

export type SetupThresholdSettlementResult =
	| { ok: true; settlementContext: ThresholdSettlementContext }
	| { ok: false; reason: "not_threshold_billed" | "nothing_to_settle" };

export const setupThresholdSettlementContext = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}): Promise<SetupThresholdSettlementResult> => {
	const fullCustomer = await getBillableFullCustomer({
		ctx,
		customerId,
		source: "setupThresholdSettlementContext",
	});

	if (!fullCustomer?.processor?.id) {
		return { ok: false, reason: "not_threshold_billed" };
	}

	const settlement = resolveThresholdSettlement({ fullCustomer, featureId });
	if (settlement.kind !== "settle") {
		return { ok: false, reason: settlement.kind };
	}

	const customerProduct = settlement.customerEntitlement.customer_product!;

	const { stripeCus, paymentMethod, testClockFrozenTime } =
		await fetchStripeCustomerForBilling({ ctx, fullCus: fullCustomer });

	// Debt is already incurred, so an uncollectable charge still has to leave an
	// invoice behind rather than be skipped the way a prepaid grant would be.
	const invoiceMode = paymentMethod
		? undefined
		: { finalizeInvoice: true, enableProductImmediately: true };

	return {
		ok: true,
		settlementContext: {
			fullCustomer,
			fullProducts: [cusProductToProduct({ cusProduct: customerProduct })],
			featureQuantities: [],
			invoiceMode,
			currentEpochMs: testClockFrozenTime ?? Date.now(),
			billingCycleAnchorMs: "now",
			resetCycleAnchorMs: "now",
			stripeCustomer: stripeCus,
			paymentMethod,
			billingVersion: BillingVersion.V2,
			actionSource: "threshold_billing",
			customerEntitlement: settlement.customerEntitlement,
			charge: settlement.charge,
		},
	};
};
