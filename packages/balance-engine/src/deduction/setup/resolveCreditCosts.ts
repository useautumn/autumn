import {
	type CreditRateCard,
	entitlementToCreditSystem,
	getCreditCost,
	getCreditRateCard,
	isInvoiceCreditCustomerEntitlement,
	isUnlimitedCustomerEntitlement,
	RecaseError,
} from "@autumn/shared";
import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";
import type { DeductionSelection } from "../types/deductionRequest.js";

export type CreditCost = {
	creditCost: number;
	rateCard: CreditRateCard | null;
	/** A zero rate is free usage: rollovers are left untouched and the main balance charges one credit per unit, as the Lua fallback does. */
	skipsRollovers: boolean;
};

/** `computeCreditCosts` for one row: credits per tracked unit under the row's effective schema, and the rate card if usage is attributed. */
export const resolveCreditCost = ({
	customerEntitlement,
	selection,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	selection: DeductionSelection;
}): CreditCost => {
	const { featureId, internalFeatureId } = selection;
	const creditSystem = entitlementToCreditSystem({
		entitlement: customerEntitlement.entitlement,
	});
	const eventProperties = selection.properties ?? undefined;
	try {
		const rateCard =
			getCreditRateCard({
				sourceFeature: { id: featureId, internal_id: internalFeatureId },
				creditSystem,
				eventProperties,
				invoiceCredit: isInvoiceCreditCustomerEntitlement({
					customerEntitlement,
				}),
			}) ?? null;
		if (rateCard && isUnlimitedCustomerEntitlement({ customerEntitlement }))
			throw new UnsupportedCommandError({
				reason: "rate_card_on_unlimited_row",
			});
		if (rateCard && customerEntitlement.additional_balance !== 0)
			throw new UnsupportedCommandError({
				reason: "rate_card_with_additional_balance",
			});
		const creditCost = getCreditCost({
			featureId,
			creditSystem,
			eventProperties,
		});
		return {
			creditCost: creditCost === 0 ? 1 : creditCost,
			rateCard,
			skipsRollovers: creditCost === 0 && rateCard === null,
		};
	} catch (error) {
		if (error instanceof RecaseError)
			throw new UnsupportedCommandError({ reason: "credit_rate_invalid" });
		throw error;
	}
};
