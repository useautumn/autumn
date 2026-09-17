import {
	ACTIVE_STATUSES,
	BillingVersion,
	cusProductToProduct,
	type FullCustomer,
	fullSubjectToFullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeCustomerForBilling.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { resolveThresholdSettlement } from "../resolve/resolveThresholdSettlement.js";
import type { ThresholdSettlementContext } from "../thresholdSettlementContext.js";

export type SetupThresholdSettlementResult =
	| { ok: true; settlementContext: ThresholdSettlementContext }
	| { ok: false; reason: "not_threshold_billed" | "nothing_to_settle" };

const getSettlementFullCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<FullCustomer | undefined> => {
	const cachedFullSubject = await getCachedFullSubject({
		ctx,
		customerId,
		source: "setupThresholdSettlementContext",
	})
		.then((result) => result.fullSubject)
		.catch(() => null);

	if (cachedFullSubject) {
		return fullSubjectToFullCustomer({ fullSubject: cachedFullSubject });
	}

	const normalizedFullSubject = await getFullSubjectNormalized({
		ctx,
		customerId,
		inStatuses: ACTIVE_STATUSES,
	});

	if (normalizedFullSubject) {
		return fullSubjectToFullCustomer({
			fullSubject: normalizedFullSubject.fullSubject,
		});
	}

	return CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ACTIVE_STATUSES,
		withSubs: true,
	});
};

export const setupThresholdSettlementContext = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}): Promise<SetupThresholdSettlementResult> => {
	const fullCustomer = await getSettlementFullCustomer({ ctx, customerId });

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
